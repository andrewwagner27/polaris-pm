import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [log, setLog] = useState([]);

  function addLog(msg) {
    console.log(msg);
    setLog(prev => [...prev, msg]);
  }

  useEffect(() => {
    async function handleCallback() {
      addLog("1. AuthCallback started");

      const { data: { session }, error } = await supabase.auth.getSession();
      addLog(`2. Session: ${session ? "found" : "null"}, error: ${error?.message || "none"}`);

      if (error || !session) { navigate("/login"); return; }

      const user = session.user;
      addLog(`3. User email: ${user.email}`);
      addLog(`4. tenant_id in metadata: ${user?.user_metadata?.tenant_id || "NONE"}`);

      const { data: tenantByEmail } = await supabase
        .from("tenants")
        .select("id, user_id, email")
        .eq("email", user.email)
        .maybeSingle();

      addLog(`5. Tenant by email: ${JSON.stringify(tenantByEmail)}`);
    }

    handleCallback();
  }, [navigate]);

  return (
    <div style={{ background:"#0A0B0D", minHeight:"100vh", padding:24, fontFamily:"monospace", color:"#C9A96E", fontSize:13 }}>
      <div style={{ marginBottom:16, color:"#EDEAE2", fontSize:16 }}>Auth Callback Debug</div>
      {log.map((l,i) => <div key={i} style={{ marginBottom:8, color:"#9095A0" }}>{l}</div>)}
      {log.length===0 && <div>Loading...</div>}
    </div>
  );
}