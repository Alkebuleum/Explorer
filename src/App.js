import React, { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Link } from "react-router-dom";

import Shell from "./components/layout/Shell";
import { WalletProvider } from "./components/wallet/WalletProvider";
import Home from "./pages/Home";
import BlockPage from "./pages/Block";
import TxPage from "./pages/Tx";
import AddressPage from "./pages/Address";
import TokensPage from "./pages/Tokens";
// Heavier pages (compiler wrapper, ethers) load on demand.
const AdminPage = lazy(() => import("./pages/Admin"));
const RegisterTokenPage = lazy(() => import("./pages/RegisterToken"));

/* Legacy ?tx= / ?address= / ?block= links from the old explorer. */
function CompatRouterGate() {
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    const qp = new URLSearchParams(loc.search);
    const tx = qp.get("tx");
    const block = qp.get("block");
    const addr = qp.get("address");
    if (tx && /^0x[a-fA-F0-9]{64}$/.test(tx)) nav(`/tx/${tx}`, { replace: true });
    else if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) nav(`/address/${addr}`, { replace: true });
    else if (block && /^[0-9]+$/.test(block)) nav(`/block/${block}`, { replace: true });
  }, [loc.search, nav]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function NotFound() {
  const loc = useLocation();
  return (
    <div className="py-16 text-center">
      <div className="eyebrow">404</div>
      <h1 className="mt-3 text-3xl font-medium">Nothing here</h1>
      <p className="mt-2 text-ink-dim">We couldn't find <code className="font-mono text-sm">{loc.pathname}</code>.</p>
      <Link to="/" className="btn-violet mt-6">Back to AlkeScan</Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <CompatRouterGate />
      <ScrollToTop />
      <WalletProvider>
      <Shell>
        <Routes>
          <Route index element={<Home />} />
          <Route path="/block/:number" element={<BlockPage />} />
          <Route path="/tx/:hash" element={<TxPage />} />
          <Route path="/address/:address" element={<AddressPage />} />
          <Route path="/tokens" element={<TokensPage />} />
          <Route path="/tokens/register" element={<Suspense fallback={null}><RegisterTokenPage /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={null}><AdminPage /></Suspense>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>
      </WalletProvider>
    </BrowserRouter>
  );
}
