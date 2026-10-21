// src/EvictionWatch.jsx
// Modus PM — Eviction Watch Module
// Full lifecycle tracking: 3-Day Notice → Cure Period → Attorney → Court → Resolution

import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

const STATUSES = [
  { key: "3_day_notice_issued",   label: "3-Day Notice Issued" },
  { key: "cure_period",           label: "Cure Period" },
  { key: "filed_with_attorney",   label: "Filed w/ Attorney" },
  { key: "court_date_scheduled",  label: "Court Date Set" },
  { key: "resolved",              label: "Resolved" },
  { key: "evicted",               label: "Evicted" },
];

const STATUS_COLOR = {
  "3_day_notice_issued":  "bg-yellow-100 text-yellow-800 border-yellow-300",
  "cure_period":          "bg-orange-100 text-orange-800 border-orange-300",
  "filed_with_attorney":  "bg-red-100 text-red-800 border-red-300",
  "court_date_scheduled": "bg-purple-100 text-purple-800 border-purple-300",
  "resolved":             "bg-green-100 text-green-800 border-green-300",
  "evicted":              "bg-gray-200 text-gray-700 border-gray-400",
};

export default function EvictionWatch() {
  const [evictions, setEvictions] = useState([]);
  const [lateRent, setLateRent] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [newNote, setNewNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("active"); // "active" | "late" | "resolved"
  const fileRef = useRef();

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const [{ data: evs }, { data: late }] = await Promise.all([
      supabase
        .from("evictions")
        .select(`*, tenants(name, units(unit_number))`)
        .order("created_at", { ascending: false }),
      supabase
        .from("rent_payments")
        .select(`*, tenants(name, units(unit_number))`)
        .eq("status", "late")
        .order("due_date", { ascending: true }),
    ]);
    setEvictions(evs || []);
    setLateRent(late || []);
  }

  function openEviction(ev) {
    setSelected(ev);
    setForm({
      status:           ev.status,
      law_firm_name:    ev.law_firm_name || "",
      attorney_contact: ev.attorney_contact || "",
      court_date:       ev.court_date ? ev.court_date.slice(0, 16) : "",
      case_number:      ev.case_number || "",
      notes:            ev.notes || "",
    });
    setNewNote("");
  }

  async function createEviction(tenantId, unitId) {
    const { data, error } = await supabase
      .from("evictions")
      .insert({
        tenant_id: tenantId,
        unit_id: unitId,
        status: "3_day_notice_issued",
        notice_delivered_at: new Date().toISOString(),
      })
      .select(`*, tenants(name, units(unit_number))`)
      .single();
    if (error) { alert("Error creating eviction record: " + error.message); return; }
    setEvictions(prev => [data, ...prev]);
    openEviction(data);
  }

  async function saveEviction() {
    if (!selected) return;
    setSaving(true);
    const updates = {
      status:           form.status,
      law_firm_name:    form.law_firm_name || null,
      attorney_contact: form.attorney_contact || null,
      court_date:       form.court_date || null,
      case_number:      form.case_number || null,
    };

    if (newNote.trim()) {
      const existing = form.notes || "";
      const timestamp = new Date().toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
      updates.notes = existing
        ? `${existing}\n\n[${timestamp}] ${newNote.trim()}`
        : `[${timestamp}] ${newNote.trim()}`;
    } else {
      updates.notes = form.notes;
    }

    const { data, error } = await supabase
      .from("evictions")
      .update(updates)
      .eq("id", selected.id)
      .select(`*, tenants(name, units(unit_number))`)
      .single();

    setSaving(false);
    if (error) { alert("Save failed: " + error.message); return; }
    setEvictions(prev => prev.map(e => e.id === data.id ? data : e));
    setSelected(data);
    setForm(f => ({ ...f, notes: data.notes || "", ...updates }));
    setNewNote("");
  }

  async function uploadDocument(e) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setUploading(true);
    const path = `evictions/${selected.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("property-docs")
      .upload(path, file, { upsert: false });

    if (upErr) { alert("Upload failed: " + upErr.message); setUploading(false); return; }

    const existing = selected.document_urls || [];
    const { data, error } = await supabase
      .from("evictions")
      .update({ document_urls: [...existing, path] })
      .eq("id", selected.id)
      .select(`*, tenants(name, units(unit_number))`)
      .single();

    setUploading(false);
    if (error) { alert("Could not save doc reference: " + error.message); return; }
    setEvictions(prev => prev.map(e => e.id === data.id ? data : e));
    setSelected(data);
  }

  async function getSignedUrl(path) {
    const { data } = await supabase.storage
      .from("property-docs")
      .createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  const activeEvictions = evictions.filter(e => !["resolved","evicted"].includes(e.status));
  const closedEvictions = evictions.filter(e => ["resolved","evicted"].includes(e.status));

  return (
    <LandlordLayout>
      <div className="flex h-full min-h-screen bg-gray-50 font-sans">
        {/* ── Left panel ── */}
        <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h1 className="text-lg font-bold text-gray-900">Eviction Watch</h1>
            <p className="text-xs text-gray-500 mt-0.5">Active cases &amp; late rent</p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 text-xs font-medium">
            {[["active","Active"], ["late","Late Rent"], ["resolved","Closed"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-2 transition-colors ${tab === key ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
              >
                {label}
                {key === "active" && activeEvictions.length > 0 && (
                  <span className="ml-1 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">{activeEvictions.length}</span>
                )}
                {key === "late" && lateRent.length > 0 && (
                  <span className="ml-1 bg-yellow-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">{lateRent.length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {tab === "active" && (
              activeEvictions.length === 0
                ? <p className="text-xs text-gray-400 p-4">No active eviction cases.</p>
                : activeEvictions.map(ev => (
                  <EvictionRow key={ev.id} ev={ev} selected={selected} onClick={() => openEviction(ev)} />
                ))
            )}

            {tab === "late" && (
              lateRent.length === 0
                ? <p className="text-xs text-gray-400 p-4">No past-due balances.</p>
                : lateRent.map(rp => (
                  <div key={rp.id} className="p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{rp.tenants?.name || "Unknown"}</p>
                        <p className="text-xs text-gray-500">Unit {rp.tenants?.units?.unit_number}</p>
                        <p className="text-xs text-red-600 font-medium mt-1">
                          ${rp.amount_due - rp.amount_paid} due · Late fee: ${rp.late_fee}
                        </p>
                      </div>
                      <button
                        onClick={() => createEviction(rp.tenant_id, rp.unit_id)}
                        className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition-colors whitespace-nowrap"
                      >
                        + Case
                      </button>
                    </div>
                  </div>
                ))
            )}

            {tab === "resolved" && (
              closedEvictions.length === 0
                ? <p className="text-xs text-gray-400 p-4">No closed cases.</p>
                : closedEvictions.map(ev => (
                  <EvictionRow key={ev.id} ev={ev} selected={selected} onClick={() => openEviction(ev)} />
                ))
            )}
          </div>
        </div>

        {/* ── Right panel ── */}
        {selected ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selected.tenants?.name || "Unknown Tenant"}
                </h2>
                <p className="text-sm text-gray-500">Unit {selected.tenants?.units?.unit_number} · Case opened {new Date(selected.created_at).toLocaleDateString()}</p>
              </div>
              <span className={`text-xs px-3 py-1 rounded-full border font-medium ${STATUS_COLOR[selected.status]}`}>
                {STATUSES.find(s => s.key === selected.status)?.label}
              </span>
            </div>

            {/* Status pipeline */}
            <div className="mb-8">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Case Progress</p>
              <div className="flex items-center gap-0">
                {STATUSES.filter(s => !["resolved","evicted"].includes(s.key)).map((s, i, arr) => {
                  const currentIdx = STATUSES.findIndex(x => x.key === selected.status);
                  const thisIdx = STATUSES.findIndex(x => x.key === s.key);
                  const isActive = s.key === selected.status;
                  const isPast = currentIdx > thisIdx;
                  return (
                    <div key={s.key} className="flex items-center flex-1">
                      <div className="flex-1 text-center">
                        <div className={`w-7 h-7 rounded-full mx-auto flex items-center justify-center text-xs font-bold border-2 transition-colors
                          ${isActive ? "bg-blue-600 border-blue-600 text-white" : isPast ? "bg-green-500 border-green-500 text-white" : "bg-white border-gray-300 text-gray-400"}`}>
                          {isPast ? "✓" : i + 1}
                        </div>
                        <p className={`text-[10px] mt-1 leading-tight ${isActive ? "text-blue-600 font-semibold" : isPast ? "text-green-600" : "text-gray-400"}`}>
                          {s.label}
                        </p>
                      </div>
                      {i < arr.length - 1 && (
                        <div className={`h-0.5 w-4 ${isPast ? "bg-green-400" : "bg-gray-200"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Status & Legal Info */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {STATUSES.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Law Firm</label>
                  <input
                    type="text"
                    value={form.law_firm_name}
                    onChange={e => setForm(f => ({ ...f, law_firm_name: e.target.value }))}
                    placeholder="e.g. Johnson &amp; Associates"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Attorney Contact</label>
                  <input
                    type="text"
                    value={form.attorney_contact}
                    onChange={e => setForm(f => ({ ...f, attorney_contact: e.target.value }))}
                    placeholder="Name, phone, or email"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Case Number</label>
                  <input
                    type="text"
                    value={form.case_number}
                    onChange={e => setForm(f => ({ ...f, case_number: e.target.value }))}
                    placeholder="Court case #"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Court Date</label>
                  <input
                    type="datetime-local"
                    value={form.court_date}
                    onChange={e => setForm(f => ({ ...f, court_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  onClick={saveEviction}
                  disabled={saving}
                  className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>

              {/* Notes + Documents */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Case Notes &amp; Audit Trail</label>
                  <div className="border border-gray-200 rounded-md bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap min-h-[80px] max-h-40 overflow-y-auto font-mono">
                    {form.notes || <span className="text-gray-400">No notes yet.</span>}
                  </div>
                  <textarea
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    placeholder="Add a note (timestamped on save)..."
                    rows={3}
                    className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Evidence Vault</label>
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <p className="text-sm text-gray-500">
                      {uploading ? "Uploading..." : "Drop files here or click to upload"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">PDFs, photos, certified mail receipts</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={uploadDocument}
                    />
                  </div>

                  {selected.document_urls?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {selected.document_urls.map((path, i) => {
                        const filename = path.split("/").pop();
                        return (
                          <li key={i} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded px-3 py-1.5">
                            <span className="text-gray-700 truncate max-w-[180px]" title={filename}>📎 {filename}</span>
                            <button
                              onClick={() => getSignedUrl(path)}
                              className="text-blue-600 hover:underline ml-2 shrink-0"
                            >
                              View
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-4xl mb-2">⚖️</p>
              <p className="text-sm">Select a case or open one from Late Rent</p>
            </div>
          </div>
        )}
      </div>
    </LandlordLayout>
  );
}

function EvictionRow({ ev, selected, onClick }) {
  const statusInfo = STATUSES.find(s => s.key === ev.status);
  return (
    <div
      onClick={onClick}
      className={`p-3 border-b border-gray-100 cursor-pointer transition-colors ${selected?.id === ev.id ? "bg-blue-50 border-l-4 border-l-blue-600" : "hover:bg-gray-50"}`}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-900">{ev.tenants?.name || "Unknown"}</p>
          <p className="text-xs text-gray-500">Unit {ev.tenants?.units?.unit_number}</p>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${STATUS_COLOR[ev.status]}`}>
          {statusInfo?.label}
        </span>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Opened {new Date(ev.created_at).toLocaleDateString()}
      </p>
    </div>
  );
}