import { useNavigate } from 'react-router-dom';
import { useState } from "react";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

const C = {
  bg:        "#0A0B0D",
  surface:   "#111316",
  raised:    "#181C21",
  border:    "#252930",
  text:      "#EDEAE2",
  textSub:   "#9095A0",
  textMuted: "#5C6270",
  gold:      "#C9A96E",
  goldDim:   "#7A5C2E",
  blue:      "#4A9AE8",
  green:     "#72B02A",
  red:       "#E05555",
  amber:     "#F0A430",
};

function formatCardNumber(val) { return val.replace(/\D/g,"").slice(0,16).replace(/(.{4})/g,"$1 ").trim(); }
function formatExpiry(val) { const d=val.replace(/\D/g,"").slice(0,4); return d.length>=3?d.slice(0,2)+"/"+d.slice(2):d; }
function detectBrand(num) { const n=num.replace(/\s/g,""); if(/^4/.test(n))return"visa"; if(/^5[1-5]/.test(n))return"mastercard"; if(/^3[47]/.test(n))return"amex"; return""; }
const brandInfo = { visa:{label:"VISA",color:"#4A9AE8"}, mastercard:{label:"MC",color:"#E05555"}, amex:{label:"AMEX",color:"#4A9AE8"} };

function Spinner() { return <span style={{width:16,height:16,border:"2px solid rgba(201,169,110,0.3)",borderTopColor:C.gold,borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite"}}/>; }

function FieldLabel({children}) { return <label style={{fontSize:11,fontWeight:600,color:C.textSub,letterSpacing:"0.08em",textTransform:"uppercase",display:"block",marginBottom:6}}>{children}</label>; }

function Input({value,onChange,placeholder,maxLength,inputMode}) {
  const [focused,setFocused]=useState(false);
  return <input value={value} onChange={onChange} placeholder={placeholder} maxLength={maxLength} inputMode={inputMode}
    onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
    style={{width:"100%",padding:"10px 12px",fontSize:14,border:`1px solid ${focused?C.gold:C.border}`,borderRadius:8,background:C.raised,color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif",boxShadow:focused?"0 0 0 3px rgba(201,169,110,0.08)":"none",transition:"border-color 0.15s"}}/>;
}

function CardForm({onSubmit,loading,amount}) {
  const [num,setNum]=useState(""); const [expiry,setExpiry]=useState(""); const [cvc,setCvc]=useState(""); const [name,setName]=useState(""); const [errors,setErrors]=useState({});
  const brand=detectBrand(num); const info=brandInfo[brand];
  function validate(){const e={};if(num.replace(/\s/g,"").length<15)e.num="Enter a valid card number";if(expiry.length<5)e.expiry="Enter MM/YY";if(cvc.length<3)e.cvc="Enter CVC";if(!name.trim())e.name="Enter name on card";setErrors(e);return Object.keys(e).length===0;}
  return (
    <div>
      <div style={{marginBottom:14}}>
        <FieldLabel>Card number</FieldLabel>
        <div style={{position:"relative"}}>
          <Input value={num} onChange={e=>{setNum(formatCardNumber(e.target.value));setErrors(p=>({...p,num:""}));}} placeholder="1234 5678 9012 3456" maxLength={19} inputMode="numeric"/>
          {info&&<span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:10,fontWeight:700,color:info.color,border:`1px solid ${info.color}40`,borderRadius:3,padding:"2px 5px"}}>{info.label}</span>}
        </div>
        {errors.num&&<p style={{fontSize:11,color:C.red,marginTop:4,margin:0}}>{errors.num}</p>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <div><FieldLabel>Expiry</FieldLabel><Input value={expiry} onChange={e=>{setExpiry(formatExpiry(e.target.value));setErrors(p=>({...p,expiry:""}));}} placeholder="MM/YY" maxLength={5} inputMode="numeric"/>{errors.expiry&&<p style={{fontSize:11,color:C.red,marginTop:4,margin:0}}>{errors.expiry}</p>}</div>
        <div><FieldLabel>CVC</FieldLabel><Input value={cvc} onChange={e=>{setCvc(e.target.value.replace(/\D/g,"").slice(0,4));setErrors(p=>({...p,cvc:""}));}} placeholder="123" maxLength={4} inputMode="numeric"/>{errors.cvc&&<p style={{fontSize:11,color:C.red,marginTop:4,margin:0}}>{errors.cvc}</p>}</div>
      </div>
      <div style={{marginBottom:20}}>
        <FieldLabel>Name on card</FieldLabel>
        <Input value={name} onChange={e=>{setName(e.target.value);setErrors(p=>({...p,name:""}));}} placeholder="Maria Rodriguez"/>
        {errors.name&&<p style={{fontSize:11,color:C.red,marginTop:4,margin:0}}>{errors.name}</p>}
      </div>
      <button onClick={()=>{if(validate())onSubmit({number:num,expiry,cvc,name});}} disabled={loading} style={{width:"100%",padding:"13px",border:`1px solid ${C.goldDim}`,borderRadius:8,fontSize:14,fontWeight:500,background:loading?"rgba(201,169,110,0.07)":"transparent",color:C.gold,cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"'DM Sans',sans-serif",opacity:loading?0.7:1}}>
        {loading?<><Spinner/> Processing…</>:`Pay $${amount?amount.toFixed(2):"1,150.00"} →`}
      </button>
    </div>
  );
}

function ACHForm() {
  return (
    <div style={{textAlign:"center",padding:"24px 0"}}>
      <div style={{width:52,height:52,borderRadius:"50%",background:`${C.blue}18`,border:`1px solid ${C.blue}33`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:22,color:C.blue}}>🏦</div>
      <p style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:6,margin:"0 0 6px"}}>Pay by bank transfer (ACH)</p>
      <p style={{fontSize:13,color:C.textSub,lineHeight:1.6,marginBottom:20,margin:"0 0 20px"}}>Link your bank account via Plaid for free ACH payments. No fees — ideal for recurring monthly rent.</p>
      <button style={{width:"100%",padding:"12px",border:`1px solid ${C.blue}44`,borderRadius:8,fontSize:14,fontWeight:500,background:"transparent",color:C.blue,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Connect bank via Plaid</button>
      <p style={{fontSize:11,color:C.textMuted,marginTop:10,margin:"10px 0 0"}}>2–3 business days to process · $0 fee</p>
    </div>
  );
}

function SuccessScreen({last4,onReset}) {
  const conf="PAY-"+Math.random().toString(36).slice(2,9).toUpperCase();
  const date=new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  return (
    <div style={{textAlign:"center",padding:"32px 0 20px"}}>
      <div style={{width:60,height:60,borderRadius:"50%",background:`${C.green}18`,border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:24,color:C.green}}>✓</div>
      <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,marginBottom:6,margin:"0 0 6px"}}>Payment received</p>
      <p style={{fontSize:14,color:C.textSub,marginBottom:24,margin:"0 0 24px"}}>$1,150.00 charged to card ending {last4}</p>
      <div style={{background:C.raised,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",textAlign:"left",marginBottom:22}}>
        {[["Payment","$1,150.00"],["Date",date],["Confirmation",conf]].map(([k,v],i,arr)=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
            <span style={{fontSize:13,color:C.textSub}}>{k}</span>
            <span style={{fontSize:13,fontWeight:500,color:C.text}}>{v}</span>
          </div>
        ))}
      </div>
      <button onClick={onReset} style={{width:"100%",padding:"12px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,fontSize:14,fontWeight:500,color:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>← Back to portal</button>
    </div>
  );
}

export default function RentPaymentScreen() {
  const { tenant } = useTenant();
  const [method,setMethod]=useState("card");
  const [loading,setLoading]=useState(false);
  const [paid,setPaid]=useState(false);
  const [last4,setLast4]=useState("4242");
  const [autopay,setAutopay]=useState(false);

  async function handleSubmit(cardData) {
    setLoading(true);
    await new Promise(r=>setTimeout(r,2000));
    setLast4(cardData.number.replace(/\s/g,"").slice(-4)||"4242");
    setLoading(false);
    setPaid(true);
  }

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin{to{transform:rotate(360deg);}}
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
      `}</style>

      <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",padding:"24px 20px 48px",maxWidth:560,margin:"0 auto"}}>

        {/* Header */}
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,color:C.text,marginBottom:4}}>Pay rent</div>
        <div style={{fontSize:13,color:C.textSub,marginBottom:20}}>June 2026</div>

        {/* Rent card */}
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px",marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Amount due</div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:36,fontWeight:600,color:C.gold,lineHeight:1}}>$1,150.00</div>
              <div style={{fontSize:12,color:C.textSub,marginTop:4}}>Unit 4B · Clifton Manor</div>
            </div>
            <span style={{fontSize:10,fontWeight:600,padding:"4px 10px",background:"rgba(240,164,48,0.13)",color:C.amber,borderRadius:20}}>Due Jun 1</span>
          </div>
          <div style={{background:C.raised,borderRadius:8,padding:"10px 12px"}}>
            {[["Base rent","$1,100.00"],["Water / sewer","$50.00"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0"}}>
                <span style={{fontSize:12,color:C.textSub}}>{k}</span>
                <span style={{fontSize:12,color:C.text}}>{v}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,marginTop:6,paddingTop:6}}>
              <span style={{fontSize:12,fontWeight:600,color:C.text}}>Total</span>
              <span style={{fontSize:12,fontWeight:600,color:C.text}}>$1,150.00</span>
            </div>
          </div>
        </div>

        {paid ? <SuccessScreen last4={last4} onReset={()=>setPaid(false)}/> : (
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px"}}>
            {/* Method tabs */}
            <div style={{display:"flex",gap:4,background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:4,marginBottom:20}}>
              {[["card","Card"],["ach","Bank (ACH)"]].map(([id,label])=>(
                <button key={id} onClick={()=>setMethod(id)} style={{flex:1,padding:"9px 0",borderRadius:6,fontSize:13,fontWeight:method===id?600:400,background:method===id?C.surface:"transparent",border:`1px solid ${method===id?C.border:"transparent"}`,color:method===id?C.text:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.12s"}}>{label}</button>
              ))}
            </div>

            {method==="card"?<CardForm onSubmit={handleSubmit} loading={loading} amount={1150}/>:<ACHForm/>}

            {method==="card"&&(
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:16,padding:"12px 14px",background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer"}} onClick={()=>setAutopay(a=>!a)}>
                <div>
                  <div style={{fontSize:13,fontWeight:500,color:C.text,marginBottom:2}}>Enable autopay</div>
                  <div style={{fontSize:11,color:C.textSub}}>Auto-charge this card on the 1st of each month</div>
                </div>
                <div style={{width:36,height:20,borderRadius:10,background:autopay?C.goldDim:C.raised,border:`1px solid ${autopay?C.goldDim:C.border}`,position:"relative",transition:"all 0.2s",flexShrink:0}}>
                  <div style={{width:14,height:14,borderRadius:"50%",background:autopay?C.gold:C.textMuted,position:"absolute",top:2,left:autopay?19:2,transition:"left 0.2s"}}/>
                </div>
              </div>
            )}

            <div style={{fontSize:11,color:C.textMuted,textAlign:"center",marginTop:14}}>Payments secured by Stripe · PCI DSS compliant</div>
          </div>
        )}
      </div>
    </TenantLayout>
  );
}