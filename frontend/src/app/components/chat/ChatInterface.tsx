import { useState, useRef, useEffect } from "react";
import * as Icons from "lucide-react";
import {
  Send, Bot, Plus, Search,
  Smile, ThumbsUp, ThumbsDown, Copy, RefreshCw,
  Sparkles, Clock, Check, Star, Trash2, HelpCircle,
  ArrowRight, Layout, Mic, MicOff, Paperclip, FileText
} from "lucide-react";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { supabase, getAccessToken } from "../../../lib/supabase";
import { useNavigate, useParams } from "react-router";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  chatbot_id: string;
  title: string;
  preview: string;
  starred: boolean;
  unread?: number;
  created_at: string;
  updated_at: string;
}

interface FAQ {
  id: string;
  question: string;
  answer: string;
}

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action';
  name: string;
  message: string;
  position: { x: number; y: number };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

interface Workflow {
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
  steps?: any[];
}

const migrateWorkflow = (wf: any): Workflow => {
  // If we have a serialized graph in `steps`, use it
  if (wf.steps && !Array.isArray(wf.steps) && typeof wf.steps === 'object' && wf.steps.nodes) {
    return { ...wf, nodes: wf.steps.nodes, edges: wf.steps.edges };
  }

  if (wf.nodes && wf.edges) return wf as Workflow;

  const nodes: WorkflowNode[] = (wf.steps || []).map((step: any, index: number) => ({
    id: step.id,
    type: index === 0 ? 'trigger' : 'action',
    name: step.label || `Node ${index + 1}`,
    message: step.message,
    position: step.position || { x: index * 320 + 100, y: 200 }
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

const BASE_CONVERSATIONS: Conversation[] = [];

function renderContent(content: string) {
  return content.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={i}>
        {i > 0 && <br />}
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**")
            ? <strong key={j}>{part.slice(2, -2)}</strong>
            : <span key={j}>{part}</span>
        )}
      </span>
    );
  });
}

function toTitleCase(text: string) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function deriveConversationTitle(content: string) {
  const normalized = content.toLowerCase();

  const topicMap: Array<{ title: string; keywords: string[] }> = [
    { title: "Business Inquiry", keywords: ["business", "company", "proposal", "partnership", "strategy", "revenue"] },
    { title: "Sales Question", keywords: ["price", "pricing", "quote", "buy", "purchase", "plan"] },
    { title: "Support Request", keywords: ["issue", "problem", "error", "help", "support", "fix"] },
    { title: "Order & Shipping", keywords: ["order", "invoice", "shipment", "shipping", "delivery", "tracking"] },
    { title: "Account Access", keywords: ["login", "signin", "password", "account", "access", "otp"] },
    { title: "Product Information", keywords: ["feature", "product", "service", "details", "info", "overview"] },
  ];

  const matched = topicMap.find((topic) => topic.keywords.some((keyword) => normalized.includes(keyword)));
  if (matched) return matched.title;

  const cleaned = content
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "New Conversation";

  const short = cleaned.split(" ").slice(0, 6).join(" ");
  return toTitleCase(short);
}

export function ChatInterface({ embedded = false, userName = '' }: { embedded?: boolean; userName?: string }) {
  const navigate = useNavigate();
  const { chatbotId } = useParams();
  const activeChatbotId = chatbotId || null;
  const PAGE_SIZE = 1000;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [totalChatsAllTime, setTotalChatsAllTime] = useState(0);
  const [resolvedRate, setResolvedRate] = useState(0);
  const [chatbot, setChatbot] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  // Stores the committed text (text before voice started + finalized speech words)
  const committedTextRef = useRef<string>("");
  // When true, onend should NOT restore text (e.g. after Send is clicked)
  const suppressRestoreRef = useRef<boolean>(false);
  // PDF upload state
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [pdfStatusMsg, setPdfStatusMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

  const handlePDFUpload = async (file: File) => {
    if (!activeChatbotId) return;
    if (file.size > 5 * 1024 * 1024) {
      setPdfStatus('error');
      setPdfStatusMsg('File exceeds 5 MB limit.');
      setTimeout(() => setPdfStatus('idle'), 4000);
      return;
    }

    setPdfStatus('uploading');
    setPdfStatusMsg(`Uploading "${file.name}"…`);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('chatbotId', activeChatbotId);
      const isSessionOnly = embedded ? 'true' : 'false';
      formData.append('sessionOnly', isSessionOnly);
      if (embedded && activeConvId) formData.append('conversationId', activeConvId);

      const token = !embedded ? await getAccessToken() : null;
      const res = await fetch(`${backendUrl}/api/knowledge/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setPdfStatus('done');
      setPdfStatusMsg(`"${data.title}" indexed (${data.chunkCount} chunks)`);
    } catch (err: any) {
      setPdfStatus('error');
      setPdfStatusMsg(err.message || 'Upload failed.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setPdfStatus('idle'), 5000);
    }
  };

  const handleVoiceToggle = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in your browser. Please use Chrome or Edge.");
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    // Snapshot whatever is already typed so we can append to it
    committedTextRef.current = inputValue;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;       // keep listening until user stops
    recognition.interimResults = true;   // stream partial results in real time
    recognition.lang = "en-US";

    recognition.onstart = () => setIsRecording(true);

    recognition.onresult = (event: any) => {
      let finalSegment = "";
      let interimSegment = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalSegment += result[0].transcript;
        } else {
          interimSegment += result[0].transcript;
        }
      }

      // Commit finalized words into the ref so they survive the next event
      if (finalSegment) {
        committedTextRef.current = committedTextRef.current
          ? committedTextRef.current + " " + finalSegment.trim()
          : finalSegment.trim();
      }

      // Always show committed + current interim in the textarea
      const displayed = interimSegment
        ? committedTextRef.current
          ? committedTextRef.current + " " + interimSegment
          : interimSegment
        : committedTextRef.current;

      setInputValue(displayed);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "permission-denied") {
        alert("Microphone access denied. Please allow microphone permissions in your browser.");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        alert("Voice input error: " + event.error);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (!suppressRestoreRef.current) {
        // Keep the final committed text in the box
        setInputValue(committedTextRef.current);
        textareaRef.current?.focus();
      }
      suppressRestoreRef.current = false;
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Get display name for addressing the user
  const displayUserName = userName || user?.user_metadata?.full_name || '';

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const embeddedChatInitializedRef = useRef(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Close emoji picker when clicking outside
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        if (!activeChatbotId) {
          // Don't redirect if in embedded mode — chatbotId comes from the URL param
          if (!embedded) navigate('/app');
          return;
        }
        fetchChatbot();
        fetchConversations();
        fetchFAQs();
        fetchWorkflows();
      }
    });
  }, [activeChatbotId, navigate, embedded]);

  useEffect(() => {
    if (activeChatbotId) {
      localStorage.setItem("activeChatbotId", activeChatbotId);
    }
  }, [activeChatbotId]);

  useEffect(() => {
    if (activeChatbotId) {
      fetchChatbot();
      fetchConversations();
      fetchFAQs();
      fetchWorkflows();
      setActiveConvId(null);
      setMessages([]);
      setActiveWorkflow(null);
      setCurrentStepId(null);
    }
  }, [activeChatbotId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeConvId) fetchMessages(activeConvId);
  }, [activeConvId]);

  useEffect(() => {
    if (!embedded || !user || !activeChatbotId || embeddedChatInitializedRef.current) return;

    embeddedChatInitializedRef.current = true;

    const initializeEmbeddedConversation = async () => {
      const newConversationId = await handleCreateChat();
      if (!newConversationId) {
        // handleCreateChat failed — reset so user can retry by refreshing
        embeddedChatInitializedRef.current = false;
        console.error('Embedded chat: failed to create conversation');
      }
    };

    initializeEmbeddedConversation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, user, activeChatbotId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const updateConversationMetadata = async (conversationId: string, previewContent: string) => {
    const currentConversation = conversations.find((item) => item.id === conversationId);
    const shouldRename = !currentConversation?.title || currentConversation.title.toLowerCase() === "new conversation";

    const payload: any = {
      preview: previewContent,
      updated_at: new Date().toISOString(),
    };

    if (shouldRename) {
      payload.title = deriveConversationTitle(previewContent);
    }

    await supabase.from('conversations').update(payload).eq('id', conversationId);

    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId
          ? {
            ...conv,
            preview: previewContent,
            title: shouldRename ? payload.title : conv.title,
            updated_at: payload.updated_at,
          }
          : conv
      )
    );
  };

  const fetchAllTimeChatStats = async () => {
    if (!activeChatbotId) {
      setTotalChatsAllTime(0);
      setResolvedRate(0);
      return;
    }

    const { data: conversationRows, error: conversationsError } = await supabase
      .from('conversations')
      .select('id')
      .eq('chatbot_id', activeChatbotId);

    if (conversationsError) {
      console.error("Error fetching all-time conversations:", conversationsError.message);
      return;
    }

    const conversationIds = new Set((conversationRows || []).map((item: any) => item.id));
    const totalConversationCount = conversationIds.size;
    setTotalChatsAllTime(totalConversationCount);

    if (!totalConversationCount) {
      setResolvedRate(0);
      return;
    }

    const resolvedConversationIds = new Set<string>();
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('role', 'assistant')
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("Error fetching all-time resolution stats:", error.message);
        return;
      }

      if (!data || data.length === 0) {
        break;
      }

      for (const item of data) {
        if (conversationIds.has(item.conversation_id)) {
          resolvedConversationIds.add(item.conversation_id);
        }
      }

      if (data.length < PAGE_SIZE) {
        break;
      }

      from += PAGE_SIZE;
    }

    const rate = Math.round((resolvedConversationIds.size / totalConversationCount) * 100);
    setResolvedRate(rate);
  };

  const fetchConversations = async () => {
    if (!activeChatbotId) return;

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('chatbot_id', activeChatbotId)
      .order('updated_at', { ascending: false });
    if (!error) {
      const list = data || [];
      setConversations(list);
      fetchAllTimeChatStats();
    }
  };

  const fetchChatbot = async () => {
    if (!activeChatbotId) return;
    const { data, error } = await supabase
      .from('chatbots')
      .select('id, name, description')
      .eq('id', activeChatbotId)
      .single();
    if (!error && data) setChatbot(data);
  };

  const fetchMessages = async (convId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('timestamp', { ascending: true });
    if (!error) setMessages(data || []);
  };

  const fetchFAQs = async () => {
    if (!activeChatbotId) return;
    const { data, error } = await supabase
      .from('faqs')
      .select('id, question, answer')
      .eq('chatbot_id', activeChatbotId)
      .eq('status', 'published')
      .limit(5);
    if (!error) setFaqs(data || []);
  };

  const fetchWorkflows = async () => {
    if (!activeChatbotId) return;
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('chatbot_id', activeChatbotId);

    if (error) console.error("Error fetching workflows:", error);

    if (!error) {
      const migrated = (data || []).map(migrateWorkflow);
      setWorkflows(migrated);
    }
  };

  const handleSelectConv = (id: string) => {
    setActiveConvId(id);
  };

  const handleCreateChat = async () => {
    if (!user || !activeChatbotId) {
      console.error("User not found during chat creation");
      return;
    }
    const { data, error } = await supabase
      .from('conversations')
      .insert([{
        user_id: user.id,
        chatbot_id: activeChatbotId,
        title: "New Conversation",
        preview: "No messages yet",
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error("Error creating chat:", error.message);
      return;
    }

    if (data) {
      setConversations(prev => [data, ...prev]);
      fetchAllTimeChatStats();
      setActiveConvId(data.id);

      // Add default greeting message
      // Use displayUserName which includes URL parameter or user metadata
      const greetingName = (displayUserName && displayUserName.trim()) 
        ? displayUserName.trim().split(' ')[0] 
        : "there";

      // Look for a 'Welcome' workflow (case insensitive)
      const welcomeWf = workflows.find(w => w.name.toLowerCase() === 'welcome');

      let initialContent = `Hello ${greetingName}, what can I do for you?`;

      if (welcomeWf && welcomeWf.nodes.length > 0) {
        const triggerNode = welcomeWf.nodes.find(n => n.type === 'trigger') || welcomeWf.nodes[0];
        // Use the first step's message but prepend the personalized greeting
        initialContent = `**Hello ${greetingName}!**\n${triggerNode.message}`;
        setActiveWorkflow(welcomeWf);
        setCurrentStepId(triggerNode.id);
      }

      const welcomeMsg: any = {
        conversation_id: data.id,
        role: "assistant",
        content: initialContent,
      };

      const { error: msgError } = await supabase.from('messages').insert([welcomeMsg]);
      if (msgError) console.error("Error creating welcome message:", msgError.message);

      // Refresh messages for the new conversation
      await fetchMessages(data.id);
      return data.id;
    }
    return null;
  };

  const handleRefreshChat = async () => {
    if (!activeConvId || !user) return;

    // Delete all messages in the current conversation
    await supabase.from('messages').delete().eq('conversation_id', activeConvId);

    // Reset workflow state
    setActiveWorkflow(null);
    setCurrentStepId(null);
    setMessages([]);

    // Re-insert the greeting message
    const greetingName = (displayUserName && displayUserName.trim())
      ? displayUserName.trim().split(' ')[0]
      : "there";

    const welcomeWf = workflows.find(w => w.name.toLowerCase() === 'welcome');
    let initialContent = `Hello ${greetingName}, what can I do for you?`;

    if (welcomeWf && welcomeWf.nodes.length > 0) {
      const triggerNode = welcomeWf.nodes.find(n => n.type === 'trigger') || welcomeWf.nodes[0];
      initialContent = `**Hello ${greetingName}!**\n${triggerNode.message}`;
      setActiveWorkflow(welcomeWf);
      setCurrentStepId(triggerNode.id);
    }

    const welcomeMsg: any = {
      conversation_id: activeConvId,
      role: "assistant",
      content: initialContent,
    };

    await supabase.from('messages').insert([welcomeMsg]);
    await fetchMessages(activeConvId);

    // Reset conversation preview
    await supabase.from('conversations').update({
      preview: "No messages yet",
      updated_at: new Date().toISOString(),
    }).eq('id', activeConvId);

    fetchConversations();
  };

  const handleDeleteChat = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this conversation?")) return;

    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Error deleting chat:", error.message);
      return;
    }

    setConversations(prev => prev.filter(c => c.id !== id));
    fetchAllTimeChatStats();
    if (activeConvId === id) {
      setActiveConvId(null);
      setMessages([]);
    }
  };

  const startWorkflow = async (wf: Workflow) => {
    if (!activeConvId || !user || !wf.nodes.length) return;

    const triggerNode = wf.nodes.find(n => n.type === 'trigger') || wf.nodes[0];
    setActiveWorkflow(wf);
    setCurrentStepId(triggerNode.id);

    const botMsg: any = {
      conversation_id: activeConvId,
      role: "assistant",
      content: triggerNode.message,
    };
    const { data: savedBotMsg } = await supabase.from('messages').insert([botMsg]).select().single();
    if (savedBotMsg) setMessages(prev => [...prev, savedBotMsg]);

    setIsTyping(false);
    fetchConversations();
  };

  const handleSend = async () => {
    const content = inputValue.trim();
    if (!content || !user) return;

    // Auto-create conversation if needed (for embedded mode)
    let currentConvId = activeConvId;
    if (!currentConvId) {
      currentConvId = await handleCreateChat();
      if (!currentConvId) return;
    }

    const userMsg: any = {
      conversation_id: currentConvId,
      role: "user",
      content,
    };

    setInputValue("");
    committedTextRef.current = "";
    // Stop voice recognition if active so it doesn't overwrite the cleared box
    if (recognitionRef.current && isRecording) {
      suppressRestoreRef.current = true;
      recognitionRef.current.stop();
    }
    const { data: savedUserMsg, error } = await supabase.from('messages').insert([userMsg]).select().single();
    if (error) {
      console.error("Error sending message:", error.message);
      return;
    }

    setMessages(prev => [...prev, savedUserMsg]);
    setIsTyping(true);

    await updateConversationMetadata(currentConvId, content);

    // Check for workflow triggers
    const triggerWords = ["hi", "hello", "hey", "start", "welcome"];
    const isGreeting = triggerWords.includes(content.toLowerCase());

    // Exact name match or if greeting, look for Welcome/Greeting workflow
    const triggerWf = workflows.find(w =>
      content.toLowerCase() === w.name.toLowerCase() ||
      (isGreeting && (w.name.toLowerCase() === 'welcome' || w.name.toLowerCase() === 'greeting'))
    );

    setTimeout(async () => {
      if (triggerWf && triggerWf.nodes.length > 0) {
        startWorkflow(triggerWf);
      } else {
        // Use AI to generate response
        try {
          const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
          const response = await fetch(`${backendUrl}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: content,
              chatbotContext: {
                name: chatbot?.name || 'AI Assistant',
                description: chatbot?.description || 'A helpful chatbot'
              },
              userName: displayUserName,
              conversationHistory: messages.slice(-5),
              chatbotId: activeChatbotId,
              conversationId: currentConvId
            })
          });

          let aiResponse: string;

          if (response.status === 429) {
            // Rate limit exceeded
            const errorData = await response.json();
            aiResponse = `⚠️ **Daily Message Limit Reached**\n\n${errorData.message || 'You have reached your daily message limit. Please try again tomorrow.'}\n\nLimit: ${errorData.limit || 50} messages per day`;
          } else if (!response.ok) {
            throw new Error('Failed to get AI response');
          } else {
            const data = await response.json();
            aiResponse = data.response;
          }

          const botMsg: any = {
            conversation_id: currentConvId,
            role: "assistant",
            content: aiResponse,
          };
          const { data: savedBotMsg, error: botError } = await supabase.from('messages').insert([botMsg]).select().single();
          if (savedBotMsg) setMessages(prev => [...prev, savedBotMsg]);
          if (botError) console.error("Error sending bot response:", botError.message);
        } catch (error) {
          console.error('Error calling AI backend:', error);
          // Fallback response if AI fails
          const botMsg: any = {
            conversation_id: currentConvId,
            role: "assistant",
            content: "I'm experiencing technical difficulties. Please try again or check if the backend server is running.",
          };
          const { data: savedBotMsg } = await supabase.from('messages').insert([botMsg]).select().single();
          if (savedBotMsg) setMessages(prev => [...prev, savedBotMsg]);
        }
        setIsTyping(false);
        fetchConversations();
      }
    }, 1000);
  };

  const handleWorkflowOptionClick = async (option: any) => {
    if (!activeConvId || !user || !activeWorkflow) return;

    // 1. Send user message (the button label)
    const targetNode = activeWorkflow.nodes.find(n => n.id === option.target);
    const userMsg = { conversation_id: activeConvId, role: "user", content: targetNode?.name || "Next" };
    const { data: savedUserMsg } = await supabase.from('messages').insert([userMsg]).select().single();
    if (savedUserMsg) setMessages(prev => [...prev, savedUserMsg]);
    await updateConversationMetadata(activeConvId, targetNode?.name || "Next");

    setIsTyping(true);

    // 2. Transition to next step
    setTimeout(async () => {
      const nextNode = option.target ? activeWorkflow.nodes.find(n => n.id === option.target) : null;

      if (nextNode) {
        setCurrentStepId(nextNode.id);
        const botMsg = { conversation_id: activeConvId, role: "assistant", content: nextNode.message };
        const { data: savedBotMsg } = await supabase.from('messages').insert([botMsg]).select().single();
        if (savedBotMsg) setMessages(prev => [...prev, savedBotMsg]);
      } else {
        // End of workflow
        setActiveWorkflow(null);
        setCurrentStepId(null);
        const botMsg = { conversation_id: activeConvId, role: "assistant", content: "Is there anything else I can help you with?" };
        const { data: savedBotMsg } = await supabase.from('messages').insert([botMsg]).select().single();
        if (savedBotMsg) setMessages(prev => [...prev, savedBotMsg]);
      }
      setIsTyping(false);
      fetchConversations();
    }, 800);
  };

  const handleFAQClick = async (faq: FAQ) => {
    let currentConvId = activeConvId;
    if (!currentConvId || !user) {
      // If no active chat, create one first and wait for the ID
      currentConvId = await handleCreateChat();
    }

    if (!currentConvId) return;

    // Send question
    const userMsg = { conversation_id: currentConvId, role: "user", content: faq.question };
    const { data: savedUserMsg } = await supabase.from('messages').insert([userMsg]).select().single();
    if (savedUserMsg) setMessages(prev => [...prev, savedUserMsg]);

    setIsTyping(true);

    await updateConversationMetadata(currentConvId, faq.question);

    // Send answer
    setTimeout(async () => {
      const botMsg = { conversation_id: currentConvId, role: "assistant", content: faq.answer };
      const { data: savedBotMsg } = await supabase.from('messages').insert([botMsg]).select().single();
      if (savedBotMsg) setMessages(prev => [...prev, savedBotMsg]);
      setIsTyping(false);
      fetchConversations();
    }, 800);
  };

  const activeConv = conversations.find(c => c.id === activeConvId);
  const filteredConvs = conversations.filter(
    (c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Conversations Sidebar */}
      {!embedded && (
      <div className="w-72 flex-shrink-0 border-r border-gray-300 dark:border-white/8 bg-gray-50 dark:bg-[#12121a] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-300 dark:border-white/8 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-black dark:text-white" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Conversations</span>
            <button
              type="button"
              onClick={handleCreateChat}
              className="w-7 h-7 bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 rounded-lg flex items-center justify-center transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/8 rounded-xl px-3 py-2">
            <Search className="w-3.5 h-3.5 text-gray-600 dark:text-gray-600" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-gray-800 dark:text-gray-400 placeholder-gray-700 dark:placeholder-gray-600 focus:outline-none flex-1"
              style={{ fontSize: "0.78rem" }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2">
          {filteredConvs.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => handleSelectConv(conv.id)}
              className={`w-full text-left px-3 py-3 rounded-xl mb-1 transition-all group ${activeConvId === conv.id
                ? "bg-violet-500/15 border border-violet-500/20"
                : "hover:bg-gray-200 dark:hover:bg-white/5 border border-transparent"
                }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${activeConvId === conv.id ? "bg-violet-500/20" : "bg-gray-200 dark:bg-white/8"
                    }`}>
                    <Bot className={`w-4 h-4 ${activeConvId === conv.id ? "text-violet-400" : "text-gray-600 dark:text-gray-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`truncate ${activeConvId === conv.id ? "text-violet-300" : "text-gray-800 dark:text-gray-300"}`} style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        {conv.title}
                      </span>
                      {conv.starred && <Star className="w-3 h-3 text-yellow-400 flex-shrink-0 fill-yellow-400" />}
                    </div>
                    <p className="text-gray-700 dark:text-gray-600 truncate" style={{ fontSize: "0.72rem" }}>{conv.preview}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-gray-700 dark:text-gray-600" style={{ fontSize: "0.65rem" }}>{new Date(conv.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <div className="flex items-center gap-1 mt-1">
                    {conv.unread ? (
                      <span className="bg-violet-500 text-white rounded-full w-4 h-4 flex items-center justify-center" style={{ fontSize: "0.6rem" }}>
                        {conv.unread}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteChat(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-700 dark:text-gray-600 hover:text-red-600 dark:hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="p-4 border-t border-gray-300 dark:border-white/8 flex-shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-3 text-center">
              <div className="text-violet-500 dark:text-violet-400" style={{ fontSize: "1.1rem", fontWeight: 700 }}>{totalChatsAllTime}</div>
              <div className="text-gray-700 dark:text-gray-600" style={{ fontSize: "0.65rem" }}>Total Chats</div>
            </div>
            <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-3 text-center">
              <div className="text-emerald-500 dark:text-emerald-400" style={{ fontSize: "1.1rem", fontWeight: 700 }}>{resolvedRate}%</div>
              <div className="text-gray-700 dark:text-gray-600" style={{ fontSize: "0.65rem" }}>Resolved</div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Chat Header */}
        {activeConvId && (
          <div className="h-14 border-b border-gray-300 dark:border-white/8 flex items-center justify-between px-5 flex-shrink-0 bg-white dark:bg-transparent">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-black dark:text-white" style={{ fontSize: "0.875rem", fontWeight: 600 }}>{chatbot?.name || "Loading..."}</div>
                <div className="flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400" style={{ fontSize: "0.7rem" }}>
                  <span className="w-1.5 h-1.5 bg-emerald-500 dark:bg-emerald-400 rounded-full inline-block" />
                  Active
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!embedded && (
                <button
                  type="button"
                  onClick={() => activeChatbotId && navigate(`/app/chat/${activeChatbotId}/manage`)}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-300 dark:border-white/8 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-1.5 transition-all"
                  style={{ fontSize: "0.75rem" }}
                >
                  Manage Bot
                </button>
              )}
              <button
                type="button"
                onClick={handleRefreshChat}
                className="px-3 py-1.5 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-300 dark:border-white/8 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-1.5 transition-all"
                style={{ fontSize: "0.75rem" }}
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
              {!embedded && (
                <button
                  type="button"
                  onClick={() => activeConvId && handleDeleteChat(activeConvId)}
                  className="w-8 h-8 flex items-center justify-center text-gray-600 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-400/10 rounded-lg transition-all"
                  title="Delete Chat"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5 bg-white dark:bg-transparent">
          {!activeConvId ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 bg-violet-500/10 rounded-2xl flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-violet-400" />
              </div>
              <h2 className="text-black dark:text-white text-xl font-bold mb-2">Welcome to Support Chat</h2>
              {embedded ? (
                <p className="text-gray-600 dark:text-gray-500 max-w-xs mb-6">Preparing your support chat…</p>
              ) : (
                <>
                  <p className="text-gray-600 dark:text-gray-500 max-w-xs mb-6">Select an existing conversation from the sidebar or start a new one to get help.</p>
                  <button
                    onClick={handleCreateChat}
                    className="px-6 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-xl font-semibold transition-all shadow-lg shadow-violet-500/25"
                  >
                    Start New Chat
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {/* AI Greeting Banner */}
              <div className="flex justify-center">
                <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-violet-300" style={{ fontSize: "0.75rem" }}>
                    AI-powered support • Active Session
                  </span>
                </div>
              </div>

              {messages.map((msg: any) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${msg.role === "assistant"
                    ? "bg-gradient-to-br from-violet-500 to-indigo-600"
                    : "bg-gradient-to-br from-pink-500 to-orange-400"
                    }`}>
                    {msg.role === "assistant"
                      ? <Bot className="w-4 h-4 text-white" />
                      : <span className="text-white" style={{ fontSize: "0.7rem", fontWeight: 700 }}>{user?.user_metadata?.full_name?.[0] || 'U'}</span>
                    }
                  </div>

                  <div className={`max-w-lg flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div className={`px-4 py-3 rounded-2xl ${msg.role === "user"
                      ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-tr-sm"
                      : "bg-gray-100 dark:bg-white/8 border border-gray-300 dark:border-white/10 text-gray-800 dark:text-gray-200 rounded-tl-sm"
                      }`} style={{ fontSize: "0.875rem", lineHeight: 1.65 }}>
                      {renderContent(msg.content)}
                    </div>

                    {/* Workflow Triggers - Shown only in the first assistant message */}
                    {msg.role === "assistant" && msg.id === messages.filter(m => m.role === "assistant")[0]?.id && workflows.length > 0 && (
                      <div className="mt-2 w-full">
                        <p className="text-gray-700 dark:text-gray-500 mb-2" style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.06em" }}>
                          START A WORKFLOW:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {workflows.map((w) => (
                            <button
                              key={w.id}
                              onClick={() => startWorkflow(w)}
                              className="px-3 py-1.5 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-300 dark:border-white/10 rounded-lg text-gray-800 dark:text-gray-200 transition-all font-semibold"
                              style={{ fontSize: "0.68rem" }}
                            >
                              {w.nodes?.find((n: any) => n.type === 'trigger')?.name || w.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Workflow Buttons - Grid or List Layout */}
                    {msg.role === "assistant" &&
                      messages.indexOf(msg) === messages.length - 1 &&
                      activeWorkflow &&
                      currentStepId && (
                        <div className="mt-4 w-full">
                          {(() => {
                            const node = activeWorkflow.nodes.find((n: any) => n.id === currentStepId);
                            if (!node) return null;
                            const nodeEdges = activeWorkflow.edges.filter(e => e.source === node.id);
                            if (!nodeEdges.length) return null;

                            return (
                              <div className="flex flex-wrap gap-2">
                                {nodeEdges.map((edge: any) => {
                                  const targetNode = activeWorkflow.nodes.find((n: any) => n.id === edge.target);
                                  return (
                                    <button
                                      key={edge.id}
                                      onClick={() => handleWorkflowOptionClick(edge)}
                                      className="px-5 py-2.5 bg-violet-500/5 hover:bg-violet-500/15 border border-violet-500/30 hover:border-violet-500/60 rounded-full text-violet-300 transition-all font-medium shadow-sm"
                                      style={{ fontSize: "0.82rem" }}
                                    >
                                      {targetNode?.name || 'End Session'}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                    <div className={`flex items-center gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                      <span className="text-gray-600" style={{ fontSize: "0.68rem" }}>
                        <Clock className="w-2.5 h-2.5 inline mr-1" />{new Date(msg.timestamp || msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {msg.role === "user" && <Check className="w-3 h-3 text-violet-400" />}
                    </div>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex-shrink-0 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white/8 border border-white/10 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Dynamic Quick Access - FAQs ONLY */}
        {faqs.length > 0 && (
          <div className="px-6 pb-4 flex items-center gap-2 overflow-x-auto no-scrollbar flex-shrink-0 border-t border-gray-300 dark:border-white/5 pt-4">
            <span className="text-gray-700 dark:text-gray-600 text-[0.6rem] font-black uppercase tracking-[0.2em] flex-shrink-0">Quick FAQs:</span>
            <div className="flex items-center gap-2">
              {faqs.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleFAQClick(f)}
                  className="px-4 py-2 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-300 dark:border-white/8 rounded-xl text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-all whitespace-nowrap flex items-center gap-2"
                  style={{ fontSize: "0.72rem" }}
                >
                  <HelpCircle className="w-3 h-3 text-gray-600 dark:text-gray-500" />
                  {f.question}
                </button>
              ))}
            </div>
          </div>
        )}


        {/* Input */}
        <div className="px-6 pb-6 flex-shrink-0">
          <div className="relative">
            {/* Emoji Picker */}
            {showEmojiPicker && (
              <div ref={emojiPickerRef} className="absolute bottom-full mb-2 right-0 z-50">
                <EmojiPicker
                  onEmojiClick={(data: EmojiClickData) => {
                    setInputValue(prev => prev + data.emoji);
                    setShowEmojiPicker(false);
                    textareaRef.current?.focus();
                  }}
                  theme={"dark" as any}
                  width={320}
                  height={380}
                />
              </div>
            )}
            {/* PDF status indicator */}
            {pdfStatus !== 'idle' && (
              <div className={`mb-2 flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg w-fit ${
                pdfStatus === 'uploading' ? 'bg-violet-500/10 text-violet-300'
                : pdfStatus === 'done' ? 'bg-green-500/10 text-green-400'
                : 'bg-red-500/10 text-red-400'
              }`}>
                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                {pdfStatusMsg}
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePDFUpload(file);
              }}
            />

            <div className="flex items-end gap-3 bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl px-4 py-3 focus-within:border-violet-500/40 transition-colors">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                ref={textareaRef}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message... (Enter to send)"
                rows={1}
                className="flex-1 bg-transparent text-gray-800 dark:text-gray-200 placeholder-gray-700 dark:placeholder-gray-600 focus:outline-none resize-none"
                style={{ fontSize: "0.875rem", lineHeight: 1.5, minHeight: "24px", maxHeight: "120px" }}
              />
              <div className="flex items-center gap-2 mb-0.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload PDF to knowledge base"
                  disabled={pdfStatus === 'uploading'}
                  className="text-gray-600 dark:text-gray-600 hover:text-violet-400 dark:hover:text-violet-400 transition-colors disabled:opacity-40"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleVoiceToggle}
                  title={isRecording ? "Stop recording" : "Voice input"}
                  className={`transition-colors ${isRecording ? 'text-red-400 animate-pulse' : 'text-gray-600 dark:text-gray-600 hover:text-violet-400 dark:hover:text-violet-400'}`}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(prev => !prev)}
                  className={`transition-colors ${showEmojiPicker ? 'text-violet-400' : 'text-gray-600 dark:text-gray-600 hover:text-violet-400 dark:hover:text-violet-400'}`}
                >
                  <Smile className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-all shadow-lg shadow-violet-500/25"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div >
  );
}
