import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GitBranch, X, Plus, Trash2, Save, Edit2, Check } from 'lucide-react';
import type { WordCard } from '@/types';

/**
 * @description 思维导图数据结构接口
 * 对应 WordCard['mindMap']
 */
type MindMapData = NonNullable<WordCard['mindMap']>;

interface MindMapProps {
  data?: MindMapData;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (data: MindMapData) => Promise<void>;
}

// Color Palette for Mind Map Branches
const COLOR_PALETTE = [
  { // Blue
    node: "bg-blue-500/20 border-blue-400/30 text-blue-100 hover:bg-blue-500/30",
    line: "rgba(96, 165, 250, 0.5)",
    editRing: "ring-blue-400"
  },
  { // Teal
    node: "bg-teal-500/20 border-teal-400/30 text-teal-100 hover:bg-teal-500/30",
    line: "rgba(45, 212, 191, 0.5)",
    editRing: "ring-teal-400"
  },
  { // Emerald
    node: "bg-emerald-500/20 border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/30",
    line: "rgba(52, 211, 153, 0.5)",
    editRing: "ring-emerald-400"
  },
  { // Amber
    node: "bg-amber-500/20 border-amber-400/30 text-amber-100 hover:bg-amber-500/30",
    line: "rgba(251, 191, 36, 0.5)",
    editRing: "ring-amber-400"
  },
  { // Rose
    node: "bg-rose-500/20 border-rose-400/30 text-rose-100 hover:bg-rose-500/30",
    line: "rgba(251, 113, 133, 0.5)",
    editRing: "ring-rose-400"
  },
  { // Cyan
    node: "bg-cyan-500/20 border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/30",
    line: "rgba(34, 211, 238, 0.5)",
    editRing: "ring-cyan-400"
  }
];

const ROOT_THEME = {
  node: "bg-gradient-to-br from-blue-500/40 to-cyan-600/40 border-white/30 text-white shadow-[0_0_30px_rgba(59,130,246,0.3)]",
  line: "rgba(255, 255, 255, 0.2)",
  editRing: "ring-white"
};

/**
 * @description 树节点组件
 * 递归渲染树状结构，支持编辑模式
 */
interface TreeNodeProps {
  node: any;
  level?: number;
  isLast?: boolean;
  path: number[];
  onUpdate: (path: number[], field: 'label' | 'meaning', value: string) => void;
  onAdd: (path: number[]) => void;
  onDelete: (path: number[]) => void;
}

const TreeNode = ({ node, level = 0, isLast = false, path, onUpdate, onAdd, onDelete }: TreeNodeProps) => {
  const hasChildren = node.children && node.children.length > 0;
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(node.label);
  const [editMeaning, setEditMeaning] = useState(node.meaning || '');

  // 同步 props 到 local state
  useEffect(() => {
    setEditLabel(node.label);
    setEditMeaning(node.meaning || '');
  }, [node.label, node.meaning]);

  const handleSaveEdit = () => {
    if (editLabel !== node.label) onUpdate(path, 'label', editLabel);
    if (editMeaning !== (node.meaning || '')) onUpdate(path, 'meaning', editMeaning);
    setIsEditing(false);
  };

  // Determine Theme based on Branch Index
  // path[0] is the index of the Level 1 category
  const branchIndex = path.length > 0 ? path[0] : -1;
  const theme = branchIndex >= 0 ? COLOR_PALETTE[branchIndex % COLOR_PALETTE.length] : ROOT_THEME;

  // 节点尺寸样式 (Sizing only)
  const nodeSizes = {
    0: "text-xl py-3 px-6 min-w-[120px]",
    1: "text-lg py-2 px-4 min-w-[100px]",
    2: "text-sm py-1.5 px-3 min-w-[80px]",
  };
  
  const currentSize = nodeSizes[level as keyof typeof nodeSizes] || nodeSizes[2];
  
  // Level 0: Root (Can Add Category)
  // Level 1: Category (Can Add Item, Can Delete)
  // Level 2: Item (Can Delete)
  const canAdd = level < 2;
  const canDelete = level > 0;

  return (
    <li 
      className={cn(
        "relative flex flex-col md:flex-row items-center md:items-start py-2 px-4 md:py-0 md:px-0",
        "before:content-[''] before:absolute",
        "after:content-[''] after:absolute",
        
        // Mobile (Vertical Tree) Lines
        "md:before:hidden md:after:hidden", // Hide default mobile lines on desktop
        "before:w-px before:h-full before:-top-2 before:left-0", // Vertical line
        "after:w-4 after:h-px after:top-1/2 after:left-0", // Horizontal connector
        isLast && "before:h-1/2", // Stop vertical line for last item
        
        // Desktop (Horizontal Tree) Styles handled by CSS below due to complexity
        "tree-node"
      )}
      // Inject CSS Variable for Line Color
      style={{ '--line-color': theme.line } as React.CSSProperties}
    >
      {/* Node Content */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "glass-panel backdrop-blur-md rounded-xl border shadow-lg z-10 relative flex flex-col items-center justify-center text-center transition-all duration-300 group cursor-default",
          currentSize,
          theme.node, // Apply Dynamic Theme Colors
          isEditing && `ring-2 ${theme.editRing} bg-black/60`
        )}
      >
        {isEditing ? (
           <div className="flex flex-col gap-2 min-w-[120px]" onClick={e => e.stopPropagation()}>
             <input 
               value={editLabel}
               onChange={e => setEditLabel(e.target.value)}
               className="bg-transparent text-white font-bold text-center border-b border-white/20 focus:border-blue-400 outline-none"
               placeholder="名称"
               autoFocus
             />
             <input 
               value={editMeaning}
               onChange={e => setEditMeaning(e.target.value)}
               className="bg-transparent text-white/70 text-xs text-center border-b border-white/20 focus:border-blue-400 outline-none"
               placeholder="含义 (可选)"
               onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
             />
             <div className="flex justify-center gap-2 mt-1">
                <button onClick={handleSaveEdit} className="p-1 rounded-full bg-green-500/20 hover:bg-green-500/40 text-green-300 transition-colors">
                  <Check className="w-3 h-3" />
                </button>
                <button onClick={() => setIsEditing(false)} className="p-1 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-300 transition-colors">
                  <X className="w-3 h-3" />
                </button>
             </div>
           </div>
        ) : (
           <>
            <span className="font-bold text-white select-text">{node.label}</span>
            {node.meaning && (
              <span className={cn(
                "text-white/70 block select-text",
                level === 0 ? "text-sm mt-1" : "text-xs mt-0.5"
              )}>
                {node.meaning}
              </span>
            )}
            
            {/* Hover Actions */}
            <div className="absolute -top-3 -right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto scale-90">
               <button 
                 onClick={() => setIsEditing(true)}
                 className="p-1.5 rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600 transition-colors"
                 title="编辑"
               >
                 <Edit2 className="w-3 h-3" />
               </button>
               {canAdd && (
                 <button 
                   onClick={() => onAdd(path)}
                   className="p-1.5 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 transition-colors"
                   title="添加子节点"
                 >
                   <Plus className="w-3 h-3" />
                 </button>
               )}
               {canDelete && (
                 <button 
                   onClick={() => onDelete(path)}
                   className="p-1.5 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-colors"
                   title="删除"
                 >
                   <Trash2 className="w-3 h-3" />
                 </button>
               )}
            </div>
           </>
        )}
      </motion.div>

      {/* Children */}
      {hasChildren && (
        <div className="relative md:ml-12 mt-4 md:mt-0 flex flex-col md:justify-center">
           {/* Horizontal Line from Parent to Children Group (Desktop) */}
           <div className="hidden md:block absolute top-1/2 -left-12 w-12 h-px bg-white/20" />
           
           <ul className={cn(
             "flex flex-col gap-4 pl-6 md:pl-0 border-l border-white/20 md:border-l-0",
             "tree-children"
           )}>
             {node.children.map((child: any, idx: number) => (
               <TreeNode 
                 key={idx} 
                 node={child} 
                 level={level + 1} 
                 isLast={idx === node.children.length - 1}
                 path={[...path, idx]}
                 onUpdate={onUpdate}
                 onAdd={onAdd}
                 onDelete={onDelete}
               />
             ))}
           </ul>
        </div>
      )}
    </li>
  );
};

/**
 * @description 思维导图组件 (MindMap) - 曾用名: 无
 * 采用液态玻璃 (Liquid Glass) 风格，重构为真实的树状图 (Tree Diagram)。
 * 支持编辑、添加、删除节点。
 */
export function MindMap({ data, isOpen, onClose, onSave }: MindMapProps) {
  const [localData, setLocalData] = useState<MindMapData | undefined>(data);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize local data when prop changes
  useEffect(() => {
    setLocalData(data);
    setIsDirty(false);
  }, [data]);

  // Helper to clone data
  const cloneData = (d: MindMapData): MindMapData => JSON.parse(JSON.stringify(d));

  // Helper to traverse to node
  const getNode = (root: any, path: number[]) => {
    let current = root;
    for (const idx of path) {
       if (!current.children) return null;
       current = current.children[idx];
    }
    return current;
  };

  // Helper to get parent
  const getParent = (root: any, path: number[]) => {
    if (path.length === 0) return null;
    let current = root;
    for (let i = 0; i < path.length - 1; i++) {
      if (!current.children) return null;
      current = current.children[path[i]];
    }
    return current;
  };

  const handleUpdate = (path: number[], field: 'label' | 'meaning', value: string) => {
    if (!localData) return;
    const newData = cloneData(localData);
    // Special case for Root (path empty)
    if (path.length === 0) {
       // @ts-ignore
       newData.root[field] = value;
    } else {
       const node = getNode(newData.root, path);
       if (node) node[field] = value;
    }
    setLocalData(newData);
    setIsDirty(true);
  };

  const handleAdd = (path: number[]) => {
    if (!localData) return;
    const newData = cloneData(localData);
    let node;
    if (path.length === 0) {
      node = newData.root;
    } else {
      node = getNode(newData.root, path);
    }
    
    if (node) {
      if (!node.children) node.children = [];
      node.children.push({
        label: '新节点',
        meaning: '',
        children: []
      });
      setLocalData(newData);
      setIsDirty(true);
    }
  };

  const handleDelete = (path: number[]) => {
    if (!localData || path.length === 0) return; // Cannot delete root
    const newData = cloneData(localData);
    const parent = getParent(newData.root, path);
    if (parent && parent.children) {
      const index = path[path.length - 1];
      parent.children.splice(index, 1);
      setLocalData(newData);
      setIsDirty(true);
    }
  };

  const handleSave = async () => {
    if (!onSave || !localData) return;
    setIsSaving(true);
    try {
      await onSave(localData);
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8"
          onClick={onClose}
        >
          {/* CSS Tree Styles */}
          <style>{`
            /* Desktop Tree Lines (md breakpoint) */
            @media (min-width: 768px) {
              .tree-node {
                display: flex;
                flex-direction: row;
                align-items: center;
                padding: 0;
                position: relative;
              }
              
              /* The connector lines logic for Horizontal Tree */
              .tree-children {
                display: flex;
                flex-direction: column;
                justify-content: center;
              }
              
              /* Vertical line connecting siblings */
              .tree-children > .tree-node::before {
                content: '';
                position: absolute;
                left: -24px; /* Half of the spacing */
                top: 0;
                bottom: 0;
                width: 1px;
                background: var(--line-color, rgba(255, 255, 255, 0.2));
                display: block;
                height: auto;
              }
              
              /* Remove top half of line for first child */
              .tree-children > .tree-node:first-child::before {
                top: 50%;
              }
              
              /* Remove bottom half of line for last child */
              .tree-children > .tree-node:last-child::before {
                bottom: 50%;
              }
              
              /* Horizontal connector from vertical line to node */
              .tree-children > .tree-node::after {
                content: '';
                position: absolute;
                left: -24px;
                top: 50%;
                width: 24px;
                height: 1px;
                background: var(--line-color, rgba(255, 255, 255, 0.2));
                display: block;
              }
              
              /* Single child special case: remove vertical line, just keep horizontal */
              .tree-children:only-child > .tree-node::before {
                display: none;
              }
            }
          `}</style>

          <motion.div 
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.9 }}
            className="w-full h-full max-w-[90vw] max-h-[90vh] glass-panel relative flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
             {/* Header */}
            <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-20 pointer-events-none">
              <h3 className="text-2xl font-bold text-white pointer-events-auto bg-black/40 px-5 py-2.5 rounded-full backdrop-blur-md border border-white/10 flex items-center gap-3 shadow-xl">
                <GitBranch className="w-6 h-6 text-blue-400" />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-200 to-white">思维导图</span>
              </h3>
              <div className="flex items-center gap-3 pointer-events-auto">
                 {isDirty && onSave && (
                   <button 
                     onClick={handleSave}
                     disabled={isSaving}
                     className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg transition-all disabled:opacity-50"
                   >
                     <Save className="w-4 h-4" />
                     {isSaving ? '保存中...' : '保存修改'}
                   </button>
                 )}
                 <button 
                   onClick={onClose}
                   className="p-2.5 rounded-full bg-black/40 hover:bg-white/10 text-white/80 hover:text-white transition-all border border-white/5 hover:border-white/20"
                 >
                   <X className="w-6 h-6" />
                 </button>
              </div>
            </div>

            {/* Scrollable Canvas */}
            <div className="flex-1 overflow-auto custom-scrollbar p-12 md:p-20 cursor-grab active:cursor-grabbing">
               {!localData || !localData.root ? (
                  <div className="flex flex-col items-center justify-center h-full text-white/40 gap-4">
                    <GitBranch className="w-12 h-12 opacity-20" />
                    <p>暂无思维导图数据</p>
                  </div>
                ) : (
                  <div className="min-w-max min-h-max flex items-center justify-center">
                    <ul className="flex flex-col md:flex-row items-center">
                       <TreeNode 
                         node={localData.root} 
                         level={0} 
                         path={[]}
                         onUpdate={handleUpdate}
                         onAdd={handleAdd}
                         onDelete={handleDelete}
                       />
                    </ul>
                  </div>
                )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

