'use client'
import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, Package, Tag } from 'lucide-react'
import type { Product, ProductCategory } from '@/types/erp'

interface ProductTreeNode extends ProductCategory {
  children: ProductCategory[]
  childCount: number
}

interface ProductTreeProps {
  tree: ProductTreeNode[]
  selectedId: number | null
  onSelect: (parentId: number | null) => void
}

function TreeNode({ node, selectedId, onSelect, depth = 0 }: { node: ProductTreeNode; selectedId: number | null; onSelect: (parentId: number | null) => void; depth?: number }) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0
  const isSelected = selectedId === node.id

  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors text-left ${isSelected ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }} className="p-0.5 shrink-0">
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
          </button>
        ) : (
          <span className="w-4.5 shrink-0" />
        )}
        {expanded ? (
          <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
        ) : (
          <Folder className="w-4 h-4 text-amber-500 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-full px-1.5 py-0.5 shrink-0">
          {node.childCount}
        </span>
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <ChildNode key={child.id} product={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function ChildNode({ product, selectedId, onSelect, depth = 0 }: { product: ProductCategory; selectedId: number | null; onSelect: (parentId: number | null) => void; depth?: number }) {
  const isSelected = selectedId === product.id
  return (
    <button
      onClick={() => onSelect(product.id)}
      className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors text-left ${isSelected ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <span className="w-4.5 shrink-0" />
      <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span className="truncate">{product.name}</span>
    </button>
  )
}

export default function ProductTree({ tree, selectedId, onSelect }: ProductTreeProps) {
  return (
    <div className="space-y-0.5">
      <button
        onClick={() => onSelect(null)}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors text-left ${selectedId === null ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
      >
        <Folder className="w-4 h-4 text-gray-400 shrink-0" />
        <span>All Products</span>
      </button>
      {tree.map(node => (
        <TreeNode key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  )
}
