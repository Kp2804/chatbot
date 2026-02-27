import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import * as Icons from "lucide-react";
import {
    GitBranch, CheckCircle2, Zap, ArrowRight, X, AlertTriangle, RefreshCw
} from "lucide-react";
import { motion } from "motion/react";
import { supabase } from "../../../lib/supabase";

/* ─── Types (Duplicated for standalone use, should be moved to shared types.ts) ─── */

export interface WorkflowNode {
    id: string;
    type: 'trigger' | 'action';
    name: string;
    message: string;
    position: { x: number; y: number };
}

export interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
}

interface SimulationMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

export interface Workflow {
    id: string;
    user_id: string;
    name: string;
    description: string;
    status: "active" | "paused" | "draft";
    triggers: number;
    run_count: number;
    success_rate: number;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    tags: string[];
    created_at: string;
    updated_at: string;
    steps?: any;
}

export const migrateWorkflow = (wf: any): Workflow => {
    if (wf.steps && !Array.isArray(wf.steps) && typeof wf.steps === 'object' && wf.steps.nodes) {
        return { ...wf, nodes: wf.steps.nodes, edges: wf.steps.edges };
    }
    if (wf.nodes && wf.edges) return wf as Workflow;

    const nodes: WorkflowNode[] = (wf.steps || []).map((step: any, index: number) => ({
        id: step.id,
        type: index === 0 ? 'trigger' : 'action',
        name: step.label || `Node ${index + 1}`,
        message: step.message,
        position: step.position || { x: index * 180 + 100, y: 200 }
    }));

    const edges: WorkflowEdge[] = [];
    (wf.steps || []).forEach((step: any) => {
        (step.options || []).forEach((opt: any) => {
            if (opt.nextStepId) {
                edges.push({
                    id: opt.id || `edge_${Date.now()}_${Math.random()}`,
                    source: step.id,
                    target: opt.nextStepId
                });
            }
        });
    });

    return {
        ...wf,
        nodes: nodes.length > 0 ? nodes : [{
            id: "trigger",
            type: "trigger",
            name: "Start",
            message: "Hello! How can I help you today?",
            position: { x: 100, y: 200 },
        }],
        edges
    } as Workflow;
};

/* ─── VisualFlowCanvas Component ─── */

function VisualFlowCanvas({
    nodes,
    edges,
    updateNode,
    addNode,
    removeNode,
    addEdge,
    removeEdge
}: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    updateNode: (id: string, patch: Partial<WorkflowNode>) => void;
    addNode: () => void;
    removeNode: (id: string) => void;
    addEdge: (sourceId: string, targetId: string) => void;
    removeEdge: (id: string) => void;
}) {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [connectingSource, setConnectingSource] = useState<string | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [viewState, setViewState] = useState({ x: 0, y: 0, zoom: 1 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (connectingSource) {
                if (!canvasRef.current) return;
                const rect = canvasRef.current.getBoundingClientRect();
                setMousePos({
                    x: (e.clientX - rect.left - viewState.x) / viewState.zoom,
                    y: (e.clientY - rect.top - viewState.y) / viewState.zoom
                });
            }
        };

        const handleMouseUp = () => {
            setConnectingSource(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [connectingSource, viewState.x, viewState.y, viewState.zoom]);

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            const delta = e.deltaY * -0.002;
            const newZoom = Math.min(Math.max(viewState.zoom + delta, 0.2), 2);
            setViewState(prev => ({ ...prev, zoom: newZoom }));
            e.preventDefault();
        }
    };

    const renderEdges = () => {
        return (
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                <defs>
                    <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                        <stop offset="50%" stopColor="#d946ef" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.4" />
                    </linearGradient>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#8b5cf6" />
                    </marker>
                </defs>

                {edges.map((edge) => {
                    const sourceNode = nodes.find(n => n.id === edge.source);
                    const targetNode = nodes.find(n => n.id === edge.target);
                    const sourceEl = nodeRefs.current[edge.source];
                    if (!sourceNode || !targetNode || !sourceEl) return null;

                    const x1 = (sourceNode.position?.x || 0) + 70;
                    const y1 = (sourceNode.position?.y || 0) + sourceEl.offsetHeight - 5;
                    const x2 = (targetNode.position?.x || 0) + 70;
                    const y2 = (targetNode.position?.y || 0) + 5;

                    const cp1y = y1 + Math.abs(y2 - y1) / 2;
                    const cp2y = y2 - Math.abs(y2 - y1) / 2;

                    return (
                        <path
                            key={edge.id}
                            d={`M ${x1} ${y1} C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`}
                            fill="none"
                            stroke="url(#edgeGradient)"
                            strokeWidth="2"
                            markerEnd="url(#arrowhead)"
                        />
                    );
                })}

                {connectingSource && (() => {
                    const sourceNode = nodes.find(n => n.id === connectingSource);
                    const sourceEl = nodeRefs.current[connectingSource];
                    if (!sourceNode || !sourceEl) return null;
                    const x1 = sourceNode.position.x + 70;
                    const y1 = sourceNode.position.y + sourceEl.offsetHeight - 5;
                    const { x: x2, y: y2 } = mousePos;
                    const cp1y = y1 + Math.abs(y2 - y1) / 2;
                    const cp2y = y2 - Math.abs(y2 - y1) / 2;

                    return (
                        <path
                            d={`M ${x1} ${y1} C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`}
                            fill="none"
                            stroke="#8b5cf6"
                            strokeWidth="2"
                            strokeOpacity="0.8"
                            strokeDasharray="4,4"
                            className="animate-[dash_1s_linear_infinite]"
                        />
                    );
                })()}
            </svg>
        );
    };

    return (
        <div
            ref={canvasRef}
            className="flex-1 w-full h-full bg-[#08080c] relative overflow-hidden select-none"
            style={{ backgroundImage: 'radial-gradient(circle, #1a1a24 1px, transparent 1px)', backgroundSize: '50px 50px' }}
            onWheel={handleWheel}
        >
            <style>{`
                @keyframes dash { to { stroke-dashoffset: -8; } }
            `}</style>

            <motion.div
                drag
                dragMomentum={false}
                onDrag={(_, info) => setViewState(prev => ({ ...prev, x: prev.x + info.delta.x, y: prev.y + info.delta.y }))}
                style={{ x: viewState.x, y: viewState.y, scale: viewState.zoom }}
                className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
            >
                {renderEdges()}

                {nodes.map((node) => (
                    <motion.div
                        key={node.id}
                        ref={(el) => { nodeRefs.current[node.id] = el; }}
                        drag
                        dragMomentum={false}
                        onDragEnd={(_, info) => {
                            const newX = (node.position?.x || 0) + info.offset.x / viewState.zoom;
                            const newY = (node.position?.y || 0) + info.offset.y / viewState.zoom;
                            updateNode(node.id, { position: { x: newX, y: newY } });
                        }}
                        initial={node.position}
                        animate={{ x: node.position?.x, y: node.position?.y }}
                        className={`absolute w-[140px] bg-[#16161e] border-2 ${node.type === 'trigger' ? 'border-amber-500/40' : 'border-white/10'} rounded-xl shadow-xl cursor-grab active:cursor-grabbing hover:border-violet-600/50 transition-colors z-10 p-0`}
                        onMouseUp={(e) => {
                            if (connectingSource && connectingSource !== node.id) {
                                addEdge(connectingSource, node.id);
                                e.stopPropagation();
                            }
                        }}
                    >
                        {node.type !== 'trigger' && (
                            <div
                                className="absolute top-[-8px] left-1/2 transform -translate-x-1/2 w-4 h-4 bg-violet-600 rounded-full border-2 border-[#08080c] cursor-pointer hover:scale-125 transition-transform z-20 shadow-[0_0_10px_rgba(139,92,246,0.5)] flex items-center justify-center group"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (connectingSource && connectingSource !== node.id) {
                                        addEdge(connectingSource, node.id);
                                        setConnectingSource(null);
                                    }
                                }}
                            >
                                <div className="w-1 h-1 bg-white rounded-full group-hover:scale-150 transition-transform" />
                            </div>
                        )}

                        <div className="flex items-center justify-between p-2.5 bg-black/20 rounded-t-2xl">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[0.55rem] font-black text-gray-500 uppercase tracking-widest">{node.type === 'trigger' ? 'TRIGGER' : 'ACTION'}</span>
                                {node.type === 'trigger' && <Zap className="w-2.5 h-2.5 text-amber-500" />}
                            </div>
                            {node.type !== 'trigger' && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); removeNode(node.id); }} className="text-gray-600 hover:text-red-400 transition-colors">
                                    <Icons.Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <div className="p-3 space-y-4">
                            <div className="space-y-1">
                                <label className="text-[0.55rem] font-black text-gray-600 uppercase tracking-widest block">{node.type === 'trigger' ? 'Trigger Label' : 'Button Name'}</label>
                                <input
                                    type="text"
                                    value={node.name}
                                    onChange={(e) => updateNode(node.id, { name: e.target.value })}
                                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-1.5 text-white font-bold text-xs focus:outline-none focus:border-violet-500/30 transition-all font-outfit"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[0.55rem] font-black text-gray-600 uppercase tracking-widest block">Bot Message</label>
                                <textarea
                                    value={node.message}
                                    onChange={(e) => updateNode(node.id, { message: e.target.value })}
                                    className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-white text-[0.7rem] font-medium focus:outline-none focus:border-violet-500/30 resize-none h-16 leading-tight scrollbar-hide"
                                />
                            </div>

                            <div className="pt-1">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[0.55rem] font-black text-gray-600 uppercase tracking-widest">Paths</span>
                                    <span className="text-[0.55rem] font-bold text-violet-400">{edges.filter(e => e.source === node.id).length}</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {edges.filter(e => e.source === node.id).map(edge => {
                                        const target = nodes.find(n => n.id === edge.target);
                                        return (
                                            <div key={edge.id} className="group relative flex items-center gap-1 px-2 py-1 bg-white/5 rounded-lg border border-white/5">
                                                <span className="text-[0.5rem] font-bold text-gray-400 truncate max-w-[60px]">{target?.name || 'End'}</span>
                                                <button onClick={(e) => { e.stopPropagation(); removeEdge(edge.id); }} className="text-gray-700 hover:text-red-400 transition-colors">
                                                    <Icons.X className="w-2 h-2" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div
                            className="absolute bottom-[-8px] left-1/2 transform -translate-x-1/2 w-4 h-4 bg-violet-600 rounded-full border-2 border-[#08080c] cursor-pointer hover:scale-125 transition-transform z-20 shadow-[0_0_10px_rgba(139,92,246,0.5)] flex items-center justify-center group"
                            onClick={(e) => {
                                e.stopPropagation();
                                setConnectingSource(node.id);
                            }}
                        >
                            <div className="w-1 h-1 bg-white rounded-full group-hover:scale-150 transition-transform" />
                        </div>
                    </motion.div>
                ))}
            </motion.div>

            {/* Zoom Controls */}
            <div className="absolute bottom-10 left-10 flex flex-col gap-2 z-50">
                <button onClick={() => setViewState(v => ({ ...v, zoom: Math.min(v.zoom + 0.1, 2) }))} className="w-10 h-10 bg-[#16161c] border border-white/10 rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-all shadow-xl">
                    <Icons.Plus className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 bg-[#16161c] border border-white/10 rounded-xl flex items-center justify-center text-[0.6rem] font-black text-gray-500">
                    {Math.round(viewState.zoom * 100)}%
                </div>
                <button onClick={() => setViewState(v => ({ ...v, zoom: Math.max(v.zoom - 0.1, 0.2) }))} className="w-10 h-10 bg-[#16161c] border border-white/10 rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-all shadow-xl">
                    <Icons.Minus className="w-5 h-5" />
                </button>
                <button onClick={() => setViewState({ x: 0, y: 0, zoom: 1 })} className="w-10 h-10 bg-[#16161c] border border-white/10 rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-all shadow-xl mt-2">
                    <Icons.Maximize className="w-5 h-5" />
                </button>
            </div>

            <button
                type="button"
                onClick={addNode}
                className="absolute bottom-10 right-10 w-20 h-20 bg-gradient-to-br from-violet-600 to-indigo-700 hover:scale-110 active:scale-95 rounded-[2rem] flex items-center justify-center text-white shadow-3xl shadow-violet-600/30 z-50 transition-all duration-300"
            >
                <Icons.Plus className="w-10 h-10" />
            </button>

            {connectingSource && (
                <div className="absolute top-10 left-1/2 transform -translate-x-1/2 px-8 py-4 bg-violet-600/90 backdrop-blur-md rounded-full text-white font-black text-xs uppercase tracking-[0.2em] shadow-2xl z-[100] animate-bounce">
                    Release over target node to connect
                </div>
            )}
        </div>
    );
}

function WorkflowVisualPreview({
    nodes,
    edges
}: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
}) {
    return (
        <div className="h-full overflow-y-auto bg-[#08080c] p-8">
            <div className="flex items-center justify-between mb-6 px-1">
                <h4 className="text-white font-black uppercase tracking-[0.24em] text-[0.65rem]">Flow Structure</h4>
                <p className="text-gray-600 text-xs font-bold uppercase tracking-widest">Visual Preview</p>
            </div>

            <div className="flex gap-6 overflow-x-auto pb-10 snap-x snap-mandatory no-scrollbar scroll-smooth">
                {nodes.map((node, index) => (
                    <div key={node.id} className="flex-shrink-0 w-80 snap-center">
                        <div className="bg-white/[0.02] border border-white/10 rounded-[2.5rem] p-6 hover:border-violet-500/40 transition-all duration-700 transform hover:-translate-y-1.5 group/node">
                            <div className="flex items-center justify-between mb-6">
                                <span className="text-[0.6rem] font-black text-gray-800 uppercase tracking-widest leading-none">
                                    {node.type === 'trigger' ? 'TRIGGER' : `NODE: ${index.toString().padStart(2, '0')}`}
                                </span>
                                <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center group-hover/node:rotate-12 transition-transform">
                                    <Icons.MessageSquare className="w-5 h-5 text-violet-500/70" />
                                </div>
                            </div>

                            <h6 className="text-white font-black mb-3 truncate pr-4 text-base tracking-tight">{node.name || 'Untitled Node'}</h6>
                            <p className="text-gray-500 text-xs line-clamp-3 mb-6 leading-relaxed font-medium">{node.message || 'No message configured.'}</p>

                            <div className="space-y-2">
                                {edges.filter((edge) => edge.source === node.id).map((edge) => {
                                    const targetNode = nodes.find((item) => item.id === edge.target);
                                    return (
                                        <div key={edge.id} className="flex items-center justify-between px-4 py-2.5 bg-black/40 rounded-2xl border border-white/5 group/opt">
                                            <span className="text-[0.65rem] font-bold text-gray-500 truncate group-hover/opt:text-white transition-colors">
                                                {targetNode?.name || 'End'}
                                            </span>
                                            <ArrowRight className="w-3.5 h-3.5 text-violet-600/30 group-hover/opt:text-violet-600 transition-colors" />
                                        </div>
                                    );
                                })}

                                {!edges.some((edge) => edge.source === node.id) && (
                                    <div className="text-center py-3 text-gray-800 text-[0.6rem] font-black uppercase tracking-[0.2em]">End of Flow</div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {nodes.length === 0 && (
                <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-10 text-center">
                    <p className="text-gray-500 text-sm font-medium">No nodes to preview yet.</p>
                </div>
            )}
        </div>
    );
}

function WorkflowSimulation({
    messages,
    options,
    running,
    onStart,
    onReset,
    onSelectOption
}: {
    messages: SimulationMessage[];
    options: Array<{ edgeId: string; label: string }>;
    running: boolean;
    onStart: () => void;
    onReset: () => void;
    onSelectOption: (edgeId: string) => void;
}) {
    return (
        <div className="h-full overflow-y-auto bg-[#08080c] p-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h4 className="text-white font-black uppercase tracking-[0.24em] text-[0.65rem]">Simulation</h4>
                    <p className="text-gray-600 text-xs font-bold uppercase tracking-widest mt-1">Test your flow before saving</p>
                </div>
                <div className="flex items-center gap-2">
                    {!running ? (
                        <button
                            type="button"
                            onClick={onStart}
                            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2"
                        >
                            <Icons.Play className="w-4 h-4" /> Start
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onReset}
                            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2"
                        >
                            <Icons.RotateCcw className="w-4 h-4" /> Reset
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-5 min-h-[320px] flex flex-col">
                {messages.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                        Start simulation to run this workflow.
                    </div>
                ) : (
                    <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                        {messages.map((message) => (
                            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${message.role === 'user'
                                    ? 'bg-violet-600 text-white rounded-tr-md'
                                    : 'bg-white/8 border border-white/10 text-gray-200 rounded-tl-md'
                                    }`}>
                                    {message.content}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {running && options.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {options.map((option) => (
                        <button
                            key={option.edgeId}
                            type="button"
                            onClick={() => onSelectOption(option.edgeId)}
                            className="px-4 py-2 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 rounded-full text-violet-300 text-xs font-medium"
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── WorkflowEditor Page ─── */

export function WorkflowEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const requestedPanel = searchParams.get('panel');
    const initialPanel: 'builder' | 'preview' | 'simulate' =
        requestedPanel === 'simulate' ? 'simulate' : requestedPanel === 'preview' ? 'preview' : 'builder';
    const activeChatbotId = localStorage.getItem("activeChatbotId");
    const [loading, setLoading] = useState(id !== 'new');
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [nodes, setNodes] = useState<WorkflowNode[]>([]);
    const [edges, setEdges] = useState<WorkflowEdge[]>([]);
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [originalWorkflow, setOriginalWorkflow] = useState<Workflow | null>(null);
    const [activePanel, setActivePanel] = useState<'builder' | 'preview' | 'simulate'>(initialPanel);
    const [simulationMessages, setSimulationMessages] = useState<SimulationMessage[]>([]);
    const [simulationCurrentNodeId, setSimulationCurrentNodeId] = useState<string | null>(null);
    const [simulationRunning, setSimulationRunning] = useState(false);

    useEffect(() => {
        if (!activeChatbotId) {
            navigate('/app');
            return;
        }
        if (id && id !== 'new') {
            fetchWorkflow(id);
        } else {
            // Default Trigger Node for new workflows
            setNodes([{
                id: "trigger",
                type: "trigger",
                name: "Start",
                message: "Hello! How can I help you today?",
                position: { x: 100, y: 200 },
            }]);
        }
    }, [id, activeChatbotId]);

    const fetchWorkflow = async (workflowId: string) => {
        if (!activeChatbotId) return;
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('workflows')
                .select('*')
                .eq('id', workflowId)
                .eq('chatbot_id', activeChatbotId)
                .single();

            if (error) throw error;
            const wf = migrateWorkflow(data);
            setOriginalWorkflow(wf);
            setName(wf.name);
            setDescription(wf.description);
            setNodes(wf.nodes);
            setEdges(wf.edges);
        } catch (err: any) {
            setError("Workflow not found or access denied.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const addNode = () => {
        const newNode: WorkflowNode = {
            id: `node_${Date.now()}`,
            type: "action",
            name: "New Button",
            message: "What should the bot say?",
            position: { x: (nodes.length * 180) + 100, y: 200 },
        };
        setNodes((prev) => [...prev, newNode]);
    };

    const updateNode = (id: string, patch: Partial<WorkflowNode>) => {
        setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    };

    const removeNode = (id: string) => {
        const node = nodes.find(n => n.id === id);
        if (node?.type === 'trigger') {
            setError("The Trigger Node cannot be deleted.");
            return;
        }
        setNodes((prev) => prev.filter((n) => n.id !== id));
        setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    };

    const addEdge = (sourceId: string, targetId: string) => {
        if (sourceId === targetId) return;
        if (edges.some(e => e.source === sourceId && e.target === targetId)) return;
        setEdges(prev => [...prev, { id: `edge_${Date.now()}`, source: sourceId, target: targetId }]);
    };

    const removeEdge = (id: string) => {
        setEdges(prev => prev.filter(e => e.id !== id));
    };

    const startSimulation = () => {
        const triggerNode = nodes.find((node) => node.type === 'trigger') || nodes[0];
        if (!triggerNode) return;

        setSimulationRunning(true);
        setSimulationCurrentNodeId(triggerNode.id);
        setSimulationMessages([
            {
                id: `sim_${Date.now()}`,
                role: 'assistant',
                content: triggerNode.message || 'No trigger message configured.'
            }
        ]);
    };

    const resetSimulation = () => {
        setSimulationRunning(false);
        setSimulationCurrentNodeId(null);
        setSimulationMessages([]);
    };

    const handleSimulationOptionSelect = (edgeId: string) => {
        const edge = edges.find((item) => item.id === edgeId);
        if (!edge) return;

        const targetNode = nodes.find((node) => node.id === edge.target);

        setSimulationMessages((prev) => {
            const next = [
                ...prev,
                {
                    id: `sim_user_${Date.now()}`,
                    role: 'user' as const,
                    content: targetNode?.name || 'Next'
                }
            ];

            if (targetNode) {
                next.push({
                    id: `sim_bot_${Date.now()}_${Math.random()}`,
                    role: 'assistant',
                    content: targetNode.message || 'No message configured.'
                });
                setSimulationCurrentNodeId(targetNode.id);
            } else {
                next.push({
                    id: `sim_end_${Date.now()}_${Math.random()}`,
                    role: 'assistant',
                    content: 'End of workflow.'
                });
                setSimulationRunning(false);
                setSimulationCurrentNodeId(null);
            }

            return next;
        });
    };

    const simulationOptions = simulationCurrentNodeId
        ? edges
            .filter((edge) => edge.source === simulationCurrentNodeId)
            .map((edge) => ({
                edgeId: edge.id,
                label: nodes.find((node) => node.id === edge.target)?.name || 'End Session'
            }))
        : [];

    const handleSave = async () => {
        if (!name.trim()) {
            setError("Please enter a name for your workflow.");
            return;
        }

        const incomplete = nodes.find((n) => !n.message.trim() || (n.type === 'action' && !n.name.trim()));
        if (incomplete) {
            setError(`Node needs both a name and a message.`);
            return;
        }

        try {
            setIsSaving(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const payload = {
                name: name.trim(),
                description: description.trim(),
                user_id: user.id,
                chatbot_id: activeChatbotId,
                steps: { nodes, edges },
                updated_at: new Date().toISOString(),
                status: originalWorkflow?.status || "active",
            };

            if (id === 'new') {
                const { error } = await supabase.from('workflows').insert([payload]);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('workflows').update(payload).eq('id', id);
                if (error) throw error;
            }

            navigate('/app/workflows');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return (
        <div className="h-full flex items-center justify-center bg-[#08080c]">
            <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
        </div>
    );

    return (
        <div className="h-full flex flex-col bg-[#08080c]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#16161c] z-20">
                <div className="flex items-center gap-4 flex-1">
                    <button onClick={() => navigate('/app/workflows')} className="p-2 text-gray-500 hover:text-white transition-colors">
                        <Icons.ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="bg-violet-500/20 p-2 rounded-xl">
                        <GitBranch className="w-5 h-5 text-violet-400" />
                    </div>
                    <div className="flex-1 max-w-md">
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => { setName(e.target.value); setError(""); }}
                            placeholder="Workflow Name (e.g. Customer Support)"
                            className="bg-transparent text-white font-bold w-full focus:outline-none placeholder:text-gray-600 text-lg"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1">
                        <button
                            type="button"
                            onClick={() => setActivePanel('builder')}
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${activePanel === 'builder' ? 'bg-violet-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
                        >
                            Builder
                        </button>
                        <button
                            type="button"
                            onClick={() => setActivePanel('preview')}
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${activePanel === 'preview' ? 'bg-violet-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
                        >
                            Preview
                        </button>
                        <button
                            type="button"
                            onClick={() => setActivePanel('simulate')}
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${activePanel === 'simulate' ? 'bg-violet-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
                        >
                            Simulate
                        </button>
                    </div>
                    <button
                        onClick={() => navigate('/app/workflows')}
                        className="px-6 py-2.5 text-gray-400 hover:text-white font-bold transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-8 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg shadow-violet-600/20"
                    >
                        {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {id === 'new' ? "Create Workflow" : "Save Changes"}
                    </button>
                </div>
            </div>

            {error && (
                <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm font-medium flex items-center gap-2 z-20">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                </div>
            )}

            <div className="flex-1 relative overflow-hidden">
                {activePanel === 'builder' ? (
                    <VisualFlowCanvas
                        nodes={nodes}
                        edges={edges}
                        updateNode={updateNode}
                        addNode={addNode}
                        removeNode={removeNode}
                        addEdge={addEdge}
                        removeEdge={removeEdge}
                    />
                ) : activePanel === 'preview' ? (
                    <WorkflowVisualPreview nodes={nodes} edges={edges} />
                ) : (
                    <WorkflowSimulation
                        messages={simulationMessages}
                        options={simulationOptions}
                        running={simulationRunning}
                        onStart={startSimulation}
                        onReset={resetSimulation}
                        onSelectOption={handleSimulationOptionSelect}
                    />
                )}

            </div>
        </div>
    );
}
