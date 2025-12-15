/**
 * @component NotesModal
 * @description 笔记弹窗组件 - 支持 Markdown 渲染、编辑、拖拽、缩放和位置记忆
 * 使用 Portal 渲染到 body，避免被父组件 transform 影响位置
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, Edit3, Save, FileText, GripHorizontal, Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface NotesModalProps {
    isOpen: boolean;
    onClose: () => void;
    notes: string;
    onSave: (notes: string) => void;
    word?: string;
}

// 存储键
const STORAGE_KEY = 'notes_modal_state';

// 获取保存的状态
const getSavedState = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch { }
    return { x: 0, y: 0, width: 600, height: 500 };
};

// 保存状态
const saveState = (state: { x: number; y: number; width: number; height: number }) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { }
};

export function NotesModal({ isOpen, onClose, notes, onSave, word }: NotesModalProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(notes);
    const [isMaximized, setIsMaximized] = useState(false);

    // 从 localStorage 加载初始状态
    const initialState = getSavedState();
    const [size, setSize] = useState({ width: initialState.width, height: initialState.height });
    const [position, setPosition] = useState({ x: initialState.x, y: initialState.y });

    const dragControls = useDragControls();
    const modalRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState(false);

    // 同步外部 notes 变化
    useEffect(() => {
        setEditContent(notes);
    }, [notes]);

    // 重置最大化状态当弹窗关闭
    useEffect(() => {
        if (!isOpen) {
            setIsMaximized(false);
        }
    }, [isOpen]);

    // 保存位置和大小
    useEffect(() => {
        if (!isMaximized && isOpen) {
            saveState({ x: position.x, y: position.y, width: size.width, height: size.height });
        }
    }, [position, size, isMaximized, isOpen]);

    const handleSave = () => {
        onSave(editContent);
        setIsEditing(false);
    };

    const handleClose = () => {
        if (isEditing && editContent !== notes) {
            if (confirm('有未保存的更改，确定要关闭吗？')) {
                setEditContent(notes);
                setIsEditing(false);
                onClose();
            }
        } else {
            onClose();
        }
    };

    // 处理缩放
    const handleResizeStart = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = size.width;
        const startHeight = size.height;

        const handleMove = (moveEvent: PointerEvent) => {
            const newWidth = Math.max(350, Math.min(window.innerWidth - 40, startWidth + (moveEvent.clientX - startX)));
            const newHeight = Math.max(250, Math.min(window.innerHeight - 40, startHeight + (moveEvent.clientY - startY)));
            setSize({ width: newWidth, height: newHeight });
        };

        const handleUp = () => {
            setIsResizing(false);
            document.removeEventListener('pointermove', handleMove);
            document.removeEventListener('pointerup', handleUp);
        };

        document.addEventListener('pointermove', handleMove);
        document.addEventListener('pointerup', handleUp);
    };

    // 使用 Portal 渲染到 body
    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* 背景遮罩 */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                    />

                    {/* 可拖拽弹窗 */}
                    <motion.div
                        ref={modalRef}
                        drag={!isMaximized}
                        dragControls={dragControls}
                        dragListener={false}
                        dragMomentum={false}
                        dragElastic={0}
                        onDragEnd={(_, info) => {
                            setPosition(prev => ({ x: prev.x + info.offset.x, y: prev.y + info.offset.y }));
                        }}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{
                            opacity: 1,
                            scale: 1,
                            x: isMaximized ? 0 : position.x,
                            y: isMaximized ? 0 : position.y,
                        }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        style={isMaximized ? undefined : { width: size.width, height: size.height }}
                        className={`fixed z-[101] flex flex-col overflow-hidden
                            bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl
                            shadow-2xl shadow-black/50
                            ${isMaximized
                                ? 'top-4 left-4 right-4 bottom-4'
                                : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
                            }`}
                    >
                        {/* 头部 - 可拖拽区域 */}
                        <div
                            className="flex items-center justify-between px-4 py-3 border-b border-white/10 cursor-move select-none flex-shrink-0"
                            onPointerDown={(e) => !isMaximized && dragControls.start(e)}
                        >
                            <div className="flex items-center gap-2">
                                <GripHorizontal className="w-4 h-4 text-white/30" />
                                <div className="w-7 h-7 rounded-lg bg-purple-500/30 flex items-center justify-center">
                                    <FileText className="w-3.5 h-3.5 text-purple-300" />
                                </div>
                                <div>
                                    <h2 className="text-white font-bold text-sm">笔记</h2>
                                    {word && <p className="text-[10px] text-white/50">{word}</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {isEditing ? (
                                    <button
                                        onClick={handleSave}
                                        className="px-2.5 py-1 rounded-lg bg-purple-500/30 text-purple-300 text-xs 
                                            flex items-center gap-1 hover:bg-purple-500/40 transition-colors"
                                    >
                                        <Save className="w-3 h-3" />
                                        保存
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="px-2.5 py-1 rounded-lg bg-white/10 text-white/70 text-xs 
                                            flex items-center gap-1 hover:bg-white/20 transition-colors"
                                    >
                                        <Edit3 className="w-3 h-3" />
                                        编辑
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsMaximized(!isMaximized)}
                                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                    title={isMaximized ? '还原' : '最大化'}
                                >
                                    {isMaximized
                                        ? <Minimize2 className="w-4 h-4 text-white/50" />
                                        : <Maximize2 className="w-4 h-4 text-white/50" />
                                    }
                                </button>
                                <button
                                    onClick={handleClose}
                                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-4 h-4 text-white/50" />
                                </button>
                            </div>
                        </div>

                        {/* 内容区域 */}
                        <div className="flex-1 overflow-y-auto p-4 min-h-0">
                            {isEditing ? (
                                <textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    placeholder="在这里添加你的笔记...\n\n支持 Markdown 语法：\n- **加粗**\n- *斜体*\n- > 引用\n- 列表"
                                    className="w-full h-full min-h-[150px] bg-white/5 border border-white/10 rounded-xl p-3 
                                        text-white/90 text-sm placeholder:text-white/30 resize-none 
                                        focus:outline-none focus:ring-1 focus:ring-purple-400/50 transition-all font-mono"
                                />
                            ) : editContent ? (
                                <div className="prose prose-invert prose-sm max-w-none
                                    prose-p:my-2 prose-p:leading-relaxed
                                    prose-headings:text-purple-300 prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1.5
                                    prose-strong:text-purple-300
                                    prose-code:bg-black/30 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-yellow-300 prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                                    prose-pre:bg-black/40 prose-pre:rounded-lg prose-pre:p-3 prose-pre:my-2 prose-pre:border prose-pre:border-white/10
                                    prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
                                    prose-blockquote:border-l-purple-400 prose-blockquote:bg-purple-500/10 prose-blockquote:rounded-r-lg prose-blockquote:py-1.5 prose-blockquote:px-3 prose-blockquote:my-2 prose-blockquote:not-italic
                                    prose-hr:border-white/20 prose-hr:my-3
                                    prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline"
                                >
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{editContent}</ReactMarkdown>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-white/30">
                                    <FileText className="w-10 h-10 mb-2 opacity-50" />
                                    <p className="text-sm">暂无笔记</p>
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="mt-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 text-xs hover:bg-purple-500/30 transition-colors"
                                    >
                                        添加笔记
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* 底部提示 */}
                        {isEditing && (
                            <div className="px-4 py-2 border-t border-white/10 text-[10px] text-white/30 flex-shrink-0">
                                💡 Markdown：**加粗** *斜体* `代码` &gt;引用 -列表
                            </div>
                        )}

                        {/* 缩放手柄 - 仅非最大化时显示 */}
                        {!isMaximized && (
                            <div
                                onPointerDown={handleResizeStart}
                                className={`absolute bottom-0 right-0 w-5 h-5 cursor-se-resize
                                    flex items-center justify-center
                                    ${isResizing ? 'bg-purple-500/30' : 'hover:bg-white/10'}
                                    transition-colors rounded-tl-lg`}
                            >
                                <svg className="w-2.5 h-2.5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 21L12 21M21 21L21 12M21 21L8 8" />
                                </svg>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
