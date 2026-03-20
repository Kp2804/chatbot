import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import {
    X, AlertTriangle, CheckCircle2, ChevronLeft, RefreshCw, HelpCircle
} from "lucide-react";
import { supabase } from "../../../lib/supabase";

export function FAQEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const activeChatbotId = localStorage.getItem("activeChatbotId");
    const [loading, setLoading] = useState(id !== 'new');
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [status, setStatus] = useState<"published" | "draft" | "archived">("draft");
    const [tagsStr, setTagsStr] = useState("");
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!activeChatbotId) {
            navigate('/app/chatbots');
            return;
        }
        if (id && id !== 'new') {
            fetchFAQ(id);
        }
    }, [id, activeChatbotId]);

    const fetchFAQ = async (faqId: string) => {
        if (!activeChatbotId) return;
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('faqs')
                .select('*')
                .eq('id', faqId)
                .eq('chatbot_id', activeChatbotId)
                .single();

            if (error) throw error;
            setQuestion(data.question);
            setAnswer(data.answer);
            setStatus(data.status);
            setTagsStr(data.tags?.join(", ") || "");
        } catch (err: any) {
            setError("FAQ not found or access denied.");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!question.trim()) { setError("Question is required"); return; }
        if (!answer.trim()) { setError("Answer is required"); return; }

        const tags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);

        try {
            setIsSaving(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const payload = {
                question: question.trim(),
                answer: answer.trim(),
                status,
                tags,
                user_id: user.id,
                chatbot_id: activeChatbotId,
                category: "General",
                updated_at: new Date().toISOString(),
            };

            if (id === 'new') {
                const { error } = await supabase.from('faqs').insert([payload]);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('faqs').update(payload).eq('id', id);
                if (error) throw error;
            }

            navigate('/app/faq');
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
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/app/faq')} className="p-2 text-gray-500 hover:text-white transition-colors">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="bg-violet-500/20 p-2 rounded-xl">
                        <HelpCircle className="w-5 h-5 text-violet-400" />
                    </div>
                    <h2 className="text-white font-bold text-lg">{id === 'new' ? "Create New FAQ" : "Edit FAQ"}</h2>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/app/faq')}
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
                        {id === 'new' ? "Create FAQ" : "Save Changes"}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-3xl mx-auto space-y-8">
                    {error && (
                        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm">
                            <AlertTriangle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    <div className="space-y-6 bg-[#16161c] border border-white/10 rounded-3xl p-8 shadow-2xl">
                        <div>
                            <label className="text-[0.65rem] font-black text-gray-600 uppercase tracking-widest block mb-3">Question</label>
                            <input
                                type="text"
                                value={question}
                                onChange={(e) => { setQuestion(e.target.value); setError(""); }}
                                placeholder="Enter the FAQ question..."
                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white font-medium focus:outline-none focus:border-violet-500/30 transition-all text-sm"
                            />
                        </div>

                        <div>
                            <label className="text-[0.65rem] font-black text-gray-600 uppercase tracking-widest block mb-3">Answer</label>
                            <textarea
                                value={answer}
                                onChange={(e) => { setAnswer(e.target.value); setError(""); }}
                                placeholder="Detailed answer (supports **bold** markdown)..."
                                rows={10}
                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white font-medium focus:outline-none focus:border-violet-500/30 transition-all text-sm leading-relaxed resize-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="text-[0.65rem] font-black text-gray-600 uppercase tracking-widest block mb-3">Status</label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as any)}
                                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white font-medium focus:outline-none focus:border-violet-500/30 transition-all text-sm appearance-none"
                                >
                                    <option value="published">Published</option>
                                    <option value="draft">Draft</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[0.65rem] font-black text-gray-600 uppercase tracking-widest block mb-3">Tags (comma separated)</label>
                                <input
                                    type="text"
                                    value={tagsStr}
                                    onChange={(e) => setTagsStr(e.target.value)}
                                    placeholder="e.g. billing, setup"
                                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white font-medium focus:outline-none focus:border-violet-500/30 transition-all text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
