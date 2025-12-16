// Web Worker Wrapper
import { supabase, SUPABASE_CONFIG } from './supabase';
import SyncWorker from './sync.worker?worker'; // Vite syntax for worker import

const SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes
const LAST_SYNC_KEY = 'last_sync_time';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';
type SyncListener = (status: SyncStatus, message?: string) => void;

class SyncManager {
    private isSyncing = false;
    private timer: ReturnType<typeof setInterval> | null = null;
    private listeners: SyncListener[] = [];
    private status: SyncStatus = 'idle';
    private worker: Worker | null = null;
    private syncTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        this.init();
    }

    private async init() {
        // Init Worker
        this.worker = new SyncWorker();
        this.worker.onmessage = (e) => this.handleWorkerMessage(e);

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            console.log('[SyncManager] User logged in, starting auto-sync...');
            this.startAutoSync();
        }

        // Listen for auth changes
        supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                this.startAutoSync();
            } else {
                this.stopAutoSync();
            }
        });
    }

    private handleWorkerMessage(e: MessageEvent) {
        const { type, status, message, newLastSync } = e.data;

        switch (type) {
            case 'STATUS':
                console.log(`[SyncManager] Worker Status: ${status} - ${message}`);
                this.notify(status, message);
                break;
            case 'SUCCESS':
                if (this.syncTimeout) {
                    clearTimeout(this.syncTimeout);
                    this.syncTimeout = null;
                }
                localStorage.setItem(LAST_SYNC_KEY, newLastSync.toString());
                this.notify('success');
                this.isSyncing = false;
                console.log(`[SyncManager] Sync finished successfully.`);
                break;
            case 'ERROR':
                if (this.syncTimeout) {
                    clearTimeout(this.syncTimeout);
                    this.syncTimeout = null;
                }
                console.error(`[SyncManager] Worker Error: ${message}`);
                this.notify('error', message);
                this.isSyncing = false;
                break;
        }
    }

    public subscribe(listener: SyncListener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify(status: SyncStatus, message?: string) {
        this.status = status;
        this.listeners.forEach(l => l(status, message));
    }

    public getStatus() {
        return this.status;
    }

    public startAutoSync() {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.sync('auto');
        }, SYNC_INTERVAL);

        // Initial sync
        this.sync('manual');
    }

    public stopAutoSync() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    public async sync(type: 'auto' | 'manual' = 'manual', mode: 'push-only' | 'full-sync' = 'push-only') {
        if (this.isSyncing) {
            console.log('[SyncManager] Already syncing, skip.');
            return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user || !session.access_token) {
            console.log('[SyncManager] No user/token, skip sync.');
            return;
        }

        this.isSyncing = true;
        this.notify('syncing', `Starting ${type} sync (${mode})...`);
        const lastSync = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0');

        console.log(`[SyncManager] Dispatching ${type} sync (${mode}) to Worker. Last sync: ${new Date(lastSync).toLocaleString()}`);

        // Set timeout: force reset if worker doesn't respond in 60s
        this.syncTimeout = setTimeout(() => {
            console.error('[SyncManager] Sync timeout (60s) - forcing reset.');
            this.notify('error', 'Sync timeout - possible network issue');
            this.isSyncing = false;
            this.syncTimeout = null;
        }, 60000);

        // Send command to Worker
        this.worker?.postMessage({
            type: 'START_SYNC',
            accessToken: session.access_token,
            lastSync,
            userId: session.user.id,
            supabaseUrl: SUPABASE_CONFIG.url,
            supabaseKey: SUPABASE_CONFIG.anonKey,
            syncMode: mode
        });
    }
}

export const syncManager = new SyncManager();
