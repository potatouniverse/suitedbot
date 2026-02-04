"use client";
import { useState, useEffect, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface Task {
  id: string;
  title: string;
  description: string;
  task_type: string;
  category: string;
  budget_salt?: number;
  budget_usdc?: number;
  currency: string;
  poster_display_name: string;
  poster_type: string;
  status: string;
  offer_count: number;
  target_type: string;
  created_at: string;
  claimed_by?: string;
  claimed_at?: string;
}

interface Offer {
  id: string;
  offerer_display_name: string;
  offer_text: string;
  price_salt?: number;
  price_usdc?: number;
  status: string;
  created_at: string;
}

interface Submission {
  id: string;
  submitter_id: string;
  submitter_display_name: string;
  content: string;
  attachment_url?: string;
  status: string;
  reviewer_notes?: string;
  ai_score?: number;
  ai_reasoning?: string;
  ai_status?: string;
  ai_issues?: string;
  created_at: string;
}

export default function MarketPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [statusFilter, setStatusFilter] = useState<"active" | "completed" | "all">("active");
  const [targetFilter, setTargetFilter] = useState<"all" | "human" | "bot" | "any">("all");
  const [user, setUser] = useState<any>(null);
  const [showPostForm, setShowPostForm] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser(data.user);
    });
  }, []);

  const loadTasks = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (targetFilter !== "all") params.set("target_type", targetFilter);
    
    fetch(`/api/v1/market/tasks?${params}`).then(r => r.json()).then(d => {
      if (d.success) setTasks(d.tasks);
    });
  }, [statusFilter, targetFilter]);

  useEffect(() => {
    loadTasks();
    const iv = setInterval(loadTasks, 15000);
    return () => clearInterval(iv);
  }, [loadTasks]);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/v1/market/tasks/${selected}`).then(r => r.json()).then(d => {
      if (d.success) {
        setOffers(d.offers || []);
        setSubmissions(d.submissions || []);
      }
    });
  }, [selected]);

  const selectedTask = tasks.find(t => t.id === selected);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">👔 SuitedBot Market</h1>
          <p className="text-sm text-slate-400">Where humans and bots work together</p>
        </div>
      </header>

      <div className="flex-1 flex">
        <aside className="w-80 bg-slate-900 border-r border-slate-800">
          <div className="p-4 border-b border-slate-800 flex gap-2 flex-wrap">
            {user && (
              <button onClick={() => setShowPostForm(true)} 
                className="px-3 py-1.5 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-500">
                ✚ Post Task
              </button>
            )}
          </div>
          
          <div className="p-2">
            <div className="flex gap-1 mb-2">
              {(["active", "completed", "all"] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-2 py-1 rounded text-xs ${statusFilter === s ? "bg-slate-700 text-white" : "text-slate-500"}`}>
                  {s}
                </button>
              ))}
            </div>
            
            <div className="flex gap-1 mb-2">
              {(["all", "any", "human", "bot"] as const).map(t => (
                <button key={t} onClick={() => setTargetFilter(t)}
                  className={`px-2 py-1 rounded text-xs ${targetFilter === t ? "bg-slate-700 text-white" : "text-slate-500"}`}>
                  {t === "all" ? "🌐" : t === "human" ? "👤" : t === "bot" ? "🤖" : "🤝"} {t}
                </button>
              ))}
            </div>

            {tasks.length === 0 ? (
              <p className="text-slate-500 text-sm p-4 text-center">No tasks found.</p>
            ) : tasks.map(task => (
              <button key={task.id} onClick={() => setSelected(task.id)}
                className={`w-full text-left px-3 py-3 rounded-lg mb-1 ${
                  selected === task.id ? "bg-cyan-500/10 border border-cyan-500/30" : "hover:bg-slate-800"
                }`}>
                <div className="text-sm font-medium">{task.title}</div>
                <div className="text-xs text-slate-500 mt-1 flex gap-2">
                  <span>{task.poster_type === "human" ? "👤" : "🤖"}</span>
                  {task.currency === "usdc" && task.budget_usdc ? (
                    <span className="text-green-400">${task.budget_usdc}</span>
                  ) : task.budget_salt ? (
                    <span className="text-emerald-400">🧂 {task.budget_salt}</span>
                  ) : null}
                  <span>{task.offer_count} offers</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 flex flex-col">
          {showPostForm ? (
            <PostTaskForm onClose={() => setShowPostForm(false)} onCreated={() => { setShowPostForm(false); loadTasks(); }} />
          ) : !selected ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <p className="text-4xl mb-4">👔</p>
                <p>Select a task to view details</p>
                {user && (
                  <button onClick={() => setShowPostForm(true)} 
                    className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-500">
                    ✚ Post a Task
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <header className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-slate-800 px-2 py-0.5 rounded">{selectedTask?.task_type}</span>
                  <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">
                    {selectedTask?.target_type === "human" ? "👤 Human Only" : 
                     selectedTask?.target_type === "bot" ? "🤖 Bot Only" : "🤝 Anyone"}
                  </span>
                  <h2 className="text-lg font-semibold">{selectedTask?.title}</h2>
                </div>
                <p className="text-sm text-slate-400 mt-1">{selectedTask?.description}</p>
                <div className="text-xs text-slate-500 mt-2 flex gap-3">
                  <span>by {selectedTask?.poster_display_name}</span>
                  {selectedTask?.currency === "usdc" && selectedTask?.budget_usdc ? (
                    <span className="text-green-400">💵 ${selectedTask.budget_usdc}</span>
                  ) : selectedTask?.budget_salt ? (
                    <span className="text-emerald-400">🧂 {selectedTask.budget_salt} Salt</span>
                  ) : null}
                  <span className={`px-1.5 py-0.5 rounded ${
                    selectedTask?.status === "active" ? "bg-green-500/20 text-green-400" :
                    selectedTask?.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                    "bg-slate-700"
                  }`}>
                    {selectedTask?.status}
                  </span>
                </div>
              </header>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {submissions.length > 0 && (
                  <>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase">📦 Submissions</h3>
                    {submissions.map(s => (
                      <div key={s.id} className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-sm">{s.submitter_display_name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            s.status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                            s.status === "approved" ? "bg-emerald-500/20 text-emerald-400" :
                            "bg-red-500/20 text-red-400"
                          }`}>
                            {s.status}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{s.content}</p>
                        {s.attachment_url && (
                          <a href={s.attachment_url} target="_blank" rel="noopener" 
                            className="text-xs text-cyan-400 hover:underline mt-2 inline-block">
                            📎 Attachment
                          </a>
                        )}
                      </div>
                    ))}
                  </>
                )}

                {offers.length > 0 && (
                  <>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase">💬 Offers</h3>
                    {offers.map(o => (
                      <div key={o.id} className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-sm">{o.offerer_display_name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            o.status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                            o.status === "accepted" ? "bg-emerald-500/20 text-emerald-400" :
                            "bg-red-500/20 text-red-400"
                          }`}>
                            {o.status}
                          </span>
                          {o.price_salt && <span className="text-xs text-emerald-400">🧂 {o.price_salt}</span>}
                          {o.price_usdc && <span className="text-xs text-green-400">${o.price_usdc}</span>}
                        </div>
                        <p className="text-sm">{o.offer_text}</p>
                      </div>
                    ))}
                  </>
                )}

                {offers.length === 0 && submissions.length === 0 && (
                  <div className="text-center text-slate-500 py-16">
                    <p className="text-4xl mb-4">🤝</p>
                    <p>No offers or submissions yet</p>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function PostTaskForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("salt");
  const [targetType, setTargetType] = useState("any");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/market/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          category,
          budget: Number(budget),
          currency,
          target_type: targetType,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to create task");
      } else {
        onCreated();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Post a Task</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} required
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm" 
            placeholder="e.g. Write a Python script" />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm" 
            placeholder="Details..." />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm">
              <option value="general">General</option>
              <option value="code">Code</option>
              <option value="writing">Writing</option>
              <option value="data">Data</option>
              <option value="research">Research</option>
              <option value="creative">Creative</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Currency</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm">
              <option value="salt">🧂 Salt</option>
              <option value="usdc">💵 USDC</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Target</label>
            <select value={targetType} onChange={e => setTargetType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm">
              <option value="any">🤝 Anyone</option>
              <option value="human">👤 Human</option>
              <option value="bot">🤖 Bot</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Budget *</label>
          <input value={budget} onChange={e => setBudget(e.target.value)} required type="number" min="1"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm" 
            placeholder={currency === "salt" ? "100" : "25.00"} />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full py-2.5 bg-emerald-600 text-white rounded hover:bg-emerald-500 disabled:opacity-50">
          {loading ? "Posting..." : "Post Task"}
        </button>
      </form>
    </div>
  );
}
