
import { useEffect, useState } from 'react';
import { Cloud, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { syncManager, type SyncStatus } from '@/lib/sync-manager';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

export function SyncStatusIndicator() {
    const [status, setStatus] = useState<SyncStatus>('idle');
    const [lastMessage, setLastMessage] = useState<string>('');
    const { user } = useAuth();

    useEffect(() => {
        // Initial status
        setStatus(syncManager.getStatus());

        // Subscribe to changes
        const unsubscribe = syncManager.subscribe((newStatus, message) => {
            setStatus(newStatus);
            if (message) setLastMessage(message);
        });

        return unsubscribe;
    }, []);

    if (!user) return null; // Only show if logged in

    const handleSync = () => {
        if (status !== 'syncing') {
            syncManager.sync('manual');
        }
    };

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={handleSync}
                disabled={status === 'syncing'}
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-md border",
                    // Idle / Success
                    (status === 'idle' || status === 'success') && "bg-black/20 text-white/50 border-white/5 hover:bg-black/30 hover:text-white hover:border-white/20",
                    // Syncing
                    status === 'syncing' && "bg-blue-500/20 text-blue-200 border-blue-500/30 cursor-wait",
                    // Error
                    status === 'error' && "bg-red-500/20 text-red-200 border-red-500/30 hover:bg-red-500/30"
                )}
                title={status === 'error' ? lastMessage : '点击手动同步'}
            >
                {status === 'idle' && <Cloud className="w-3.5 h-3.5" />}
                {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                {status === 'syncing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-400" />}

                <span className="hidden sm:inline">
                    {status === 'idle' && '已同步'}
                    {status === 'success' && '同步完成'}
                    {status === 'syncing' && '同步中...'}
                    {status === 'error' && '同步失败'}
                </span>
            </button>
        </div>
    );
}
