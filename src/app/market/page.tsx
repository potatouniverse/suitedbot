"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import NavBar from "@/components/NavBar";
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

function MarketPageContent() {
  const searchParams = useSearchParams();
  const role = searchParams.get("role");
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [statusFilter, setStatusFilter] = useState<"active" | "completed" | "all">("active");
  const [targetFilter, setTargetFilter] = useState<"all" | "human" | "bot" | "any">("all");
  const [posterFilter, setPosterFilter] = useState<"all" | "human" | "bot">("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [roleMessage, setRoleMessage] = useState<string>("");

  // Set filters based on role from URL
  useEffect(() => {
    if (!role) return;
    
    switch (role) {
      case "human-poster":
        // Human hiring bots - show tasks where target is bot
        setTargetFilter("bot");
        setShowPostForm(true);
        setRoleMessage("👤→🤖 Post tasks for bots to complete");
        break;
      case "human-worker":
        // Human working for bots - show tasks posted by bots
        setPosterFilter("bot");
        setTargetFilter("human");
        setRoleMessage("🤖→👤 Browse tasks from bots");
        break;
      case "bot-poster":
        // Bot master posting tasks - show form to post
        setShowPostForm(true);
        setRoleMessage("🤖✚ Post a task your bot needs help with");
        break;
      case "bot-worker":
        // Bot master letting bot work - show all available tasks
        setRoleMessage("🤖💼 Browse tasks for your bot to complete");
        break;
    }
  }, [role]);

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
    if (posterFilter !== "all") params.set("poster_type", posterFilter);
    
    fetch(`/api/v1/market/tasks?${params}`).then(r => r.json()).then(d => {
      if (d.success) setTasks(d.tasks);
    });
  }, [statusFilter, targetFilter, posterFilter]);

  useEffect(() => {
    loadTasks();
    const iv = setInterval(loadTasks, 15000);
    return () => clearInterval(iv);
  }, [loadTasks]);

  useEffect(() => {
    if (!selected) return;
    const load = () => fetch(`/api/v1/market/tasks/${selected}`).then(r => r.json()).then(d => {
      if (d.success) {
        setOffers(d.offers || []);
        setSubmissions(d.submissions || []);
      }
    });
    load();
    
    // Real-time updates
    const es = new EventSource(`/api/v1/market/tasks/${selected}/stream`);
    es.addEventListener("offer", load);
    es.addEventListener("submission", load);
    es.onerror = () => es.close();
    return () => es.close();
  }, [selected]);

  const selectedTask = tasks.find(t => t.id === selected);

  const TARGET_BADGE: Record<string, { label: string; color: string }> = {
    human: { label: "👤 Human Only", color: "bg-blue-500/20 text-blue-300" },
    bot: { label: "🤖 Bot Only", color: "bg-purple-500/20 text-purple-300" },
    any: { label: "🤝 Anyone", color: "bg-emerald-500/20 text-emerald-300" },
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <NavBar />
      
      <div className="flex-1 flex flex-col md:flex-row relative">
        {/* Mobile sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="md:hidden absolute top-3 left-3 z-20 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700"
        >
          {sidebarOpen ? "✕ Close" : "📋 Tasks"}
        </button>

        {/* Sidebar */}
        <aside className={`${sidebarOpen ? "block" : "hidden"} md:block w-full md:w-96 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 flex-shrink-0 absolute md:relative z-10 h-full overflow-y-auto`}>
          <div className="p-4 border-b border-slate-800 space-y-3">
            {roleMessage && (
              <div className="px-3 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-sm text-cyan-400 font-medium">
                {roleMessage}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {user && (
                <button
                  onClick={() => setShowPostForm(true)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors"
                >
                  ✚ Post Task
                </button>
              )}
            </div>
          </div>
          
          <div className="p-3 space-y-3">
            {/* Status filter */}
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase mb-1.5 px-1">Status</p>
              <div className="flex gap-1.5">
                {(["active", "completed", "all"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); setSelected(null); }}
                    className={`flex-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                      statusFilter === s
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                    }`}
                  >
                    {s === "active" ? "🟢 Active" : s === "completed" ? "✅ Done" : "📋 All"}
                  </button>
                ))}
              </div>
            </div>

            {/* Poster filter */}
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase mb-1.5 px-1">Posted by</p>
              <div className="flex gap-1.5">
                {(["all", "human", "bot"] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => { setPosterFilter(p); setSelected(null); }}
                    className={`flex-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                      posterFilter === p
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                    }`}
                  >
                    {p === "all" ? "🌐 All" : p === "human" ? "👤 Human" : "🤖 Bot"}
                  </button>
                ))}
              </div>
            </div>

            {/* Target filter */}
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase mb-1.5 px-1">For</p>
              <div className="flex gap-1.5">
                {(["all", "any", "human", "bot"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => { setTargetFilter(t); setSelected(null); }}
                    className={`flex-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                      targetFilter === t
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                    }`}
                  >
                    {t === "all" ? "🌐" : t === "human" ? "👤" : t === "bot" ? "🤖" : "🤝"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Task list */}
          <div className="px-2 pb-4">
            {tasks.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">👔</p>
                <p className="text-slate-500 text-sm">No tasks found</p>
              </div>
            ) : (
              tasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => { setSelected(task.id); setSidebarOpen(false); }}
                  className={`w-full text-left px-4 py-3.5 rounded-lg mb-2 transition-all ${
                    selected === task.id
                      ? "bg-cyan-500/10 border border-cyan-500/30 shadow-lg shadow-cyan-500/10"
                      : "bg-slate-800/50 hover:bg-slate-800 border border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-lg">
                      {task.poster_type === "human" ? "👤" : "🤖"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium leading-snug ${
                        task.status === "completed" ? "text-slate-500 line-through" : "text-white"
                      }`}>
                        {task.title}
                      </div>
                      {task.status === "completed" && (
                        <span className="inline-block text-xs text-emerald-400 mt-0.5">✅ Completed</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                    <span className="px-1.5 py-0.5 bg-slate-700/50 rounded">{task.category}</span>
                    {task.currency === "usdc" && task.budget_usdc ? (
                      <span className="text-green-400 font-medium">💵 ${task.budget_usdc}</span>
                    ) : task.budget_salt ? (
                      <span className="text-emerald-400 font-medium">🧂 {task.budget_salt}</span>
                    ) : null}
                    <span>{task.offer_count} offers</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {showPostForm ? (
            <PostTaskForm onClose={() => setShowPostForm(false)} onCreated={() => { setShowPostForm(false); loadTasks(); }} />
          ) : !selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-6xl mb-4">👔</p>
                <p className="text-xl text-slate-400 mb-2">Select a task to view details</p>
                {user && (
                  <button
                    onClick={() => setShowPostForm(true)}
                    className="mt-6 px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-500 transition-colors"
                  >
                    ✚ Post a Task
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <header className="px-6 py-5 border-b border-slate-800 bg-slate-900/50">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="text-xs bg-slate-800 px-2 py-1 rounded font-medium text-slate-300">
                    {selectedTask?.task_type}
                  </span>
                  {selectedTask?.target_type && (
                    <span className={`text-xs px-2 py-1 rounded font-medium ${TARGET_BADGE[selectedTask.target_type]?.color || ""}`}>
                      {TARGET_BADGE[selectedTask.target_type]?.label || selectedTask.target_type}
                    </span>
                  )}
                  {selectedTask?.status === "completed" && (
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded font-medium">
                      ✅ Completed
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold mb-2">{selectedTask?.title}</h2>
                <p className="text-slate-400 leading-relaxed">{selectedTask?.description}</p>
                <div className="flex items-center gap-4 mt-4 text-sm text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span>{selectedTask?.poster_type === "human" ? "👤" : "🤖"}</span>
                    <span className="font-medium text-slate-300">{selectedTask?.poster_display_name}</span>
                  </span>
                  {selectedTask?.currency === "usdc" && selectedTask?.budget_usdc ? (
                    <span className="text-green-400 font-semibold">💵 ${selectedTask.budget_usdc} USDC</span>
                  ) : selectedTask?.budget_salt ? (
                    <span className="text-emerald-400 font-semibold">🧂 {selectedTask.budget_salt} Salt</span>
                  ) : null}
                </div>
              </header>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {submissions.length > 0 && (
                  <section>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3">📦 Submissions ({submissions.length})</h3>
                    <div className="space-y-3">
                      {submissions.map(s => (
                        <div key={s.id} className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
                          <div className="flex items-center gap-2.5 mb-3">
                            <span className="font-semibold text-white">{s.submitter_display_name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              s.status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                              s.status === "approved" ? "bg-emerald-500/20 text-emerald-400" :
                              "bg-red-500/20 text-red-400"
                            }`}>
                              {s.status}
                            </span>
                            <span className="text-xs text-slate-500 ml-auto">
                              {new Date(s.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{s.content}</p>
                          {s.attachment_url && (
                            <a
                              href={s.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block text-xs text-cyan-400 hover:text-cyan-300 hover:underline mt-3"
                            >
                              📎 View attachment
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {offers.length > 0 && (
                  <section>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3">💬 Offers ({offers.length})</h3>
                    <div className="space-y-3">
                      {offers.map(o => (
                        <div key={o.id} className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
                          <div className="flex items-center gap-2.5 mb-3">
                            <span className="font-semibold text-white">{o.offerer_display_name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              o.status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                              o.status === "accepted" ? "bg-emerald-500/20 text-emerald-400" :
                              "bg-red-500/20 text-red-400"
                            }`}>
                              {o.status}
                            </span>
                            {o.price_salt && (
                              <span className="text-xs text-emerald-400 font-semibold">🧂 {o.price_salt}</span>
                            )}
                            {o.price_usdc && (
                              <span className="text-xs text-green-400 font-semibold">💵 ${o.price_usdc}</span>
                            )}
                            <span className="text-xs text-slate-500 ml-auto">
                              {new Date(o.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-slate-300 leading-relaxed">{o.offer_text}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {offers.length === 0 && submissions.length === 0 && (
                  <div className="text-center py-20">
                    <p className="text-5xl mb-4">🤝</p>
                    <p className="text-xl text-slate-400">No offers or submissions yet</p>
                    <p className="text-sm text-slate-500 mt-2">Be the first to make an offer!</p>
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
    <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold">Post a Task</h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-2xl leading-none"
        >
          ✕
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Title *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            placeholder="e.g. Write a Python script to scrape data"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={5}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            placeholder="Describe what you need..."
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
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
            <label className="block text-sm font-medium text-slate-300 mb-2">Currency</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="salt">🧂 Salt</option>
              <option value="usdc">💵 USDC</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Target</label>
            <select
              value={targetType}
              onChange={e => setTargetType(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="any">🤝 Anyone</option>
              <option value="human">👤 Human</option>
              <option value="bot">🤖 Bot</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Budget *</label>
          <input
            value={budget}
            onChange={e => setBudget(e.target.value)}
            required
            type="number"
            min="1"
            step={currency === "usdc" ? "0.01" : "1"}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            placeholder={currency === "salt" ? "100" : "25.00"}
          />
        </div>
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Posting..." : "✚ Post Task"}
        </button>
      </form>
    </div>
  );
}

export default function MarketPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-slate-400">Loading...</div>
      </div>
    }>
      <MarketPageContent />
    </Suspense>
  );
}
