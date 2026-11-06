import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "./supabase";

const C = { red:"#E05555", text:"#EDEAE2", textSub:"#9095A0", gold:"#C9A96E" };

const PROBLEM = {
  no_owner_email:      "no owner email on the property",
  no_matching_owner:   "no owner account uses this property's owner email",
  owner_not_onboarded: "the owner hasn't finished Stripe payout setup",
};

// Online rent is refused for a property whose owner can't receive payouts. This tells the landlord which ones, and why.
export default function PaymentRouteWarning() {
  const [gaps, setGaps] = useState([]);

  useEffect(() => {
    let live = true;
    supabase.rpc("a2_payment_route_gaps").then(({ data, error }) => { if (live && !error) setGaps(data || []); });
    return () => { live = false; };
  }, []);

  if (!gaps.length) return null;
  return (
    <div role="alert" style={{ background:"rgba(224,85,85,0.08)",border:"1px solid rgba(224,85,85,0.35)",borderRadius:10,padding:"14px 16px",marginBottom:20 }}>
      <div style={{ fontSize:13,fontWeight:600,color:C.red,marginBottom:4 }}>
        Online rent payments are off for {gaps.length} {gaps.length === 1 ? "property" : "properties"}
      </div>
      <div style={{ fontSize:12,color:C.textSub,marginBottom:8,lineHeight:1.6 }}>
        Tenants at these properties can't pay rent online. Nothing is charged; they're asked to pay you directly.
        To turn it on, finish Stripe payout setup in <Link to="/landlord/settings" style={{ color:C.gold }}>Settings</Link>, and make sure each property's owner email is the same email as the owner's Modus account.
      </div>
      <ul style={{ margin:"0 0 0 18px",fontSize:12,color:C.text,lineHeight:1.7 }}>
        {gaps.map(g => <li key={g.property_id}>{g.property_name}: <span style={{ color:C.textSub }}>{PROBLEM[g.problem] || g.problem}</span></li>)}
      </ul>
    </div>
  );
}
