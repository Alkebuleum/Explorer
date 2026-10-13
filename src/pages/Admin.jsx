import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/ui/Card";
import ErrorBanner from "../components/ui/ErrorBanner";
import Loading, { Spinner } from "../components/ui/Loading";
import { currentUser, isAdminUser, signInAdmin, signInAdminWithGoogle, signOutAdmin } from "../lib/firebase";
import ReviewQueue from "../components/contract/ReviewQueue";

export default function AdminPage() {
    const [user, setUser] = useState(undefined);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        currentUser().then((u) => setUser(isAdminUser(u) ? u : null)).catch(() => setUser(null));
    }, []);

    async function google() {
        setErr(null);
        setBusy(true);
        try {
            setUser(await signInAdminWithGoogle());
        } catch (e2) {
            setErr(
                e2.code === "auth/operation-not-allowed" ? "Google sign-in isn't enabled for this Firebase project yet (Authentication → Sign-in method → Google)."
                    : e2.code === "auth/unauthorized-domain" ? `This site's domain (${window.location.hostname}) isn't in Firebase's authorized domains (Authentication → Settings).`
                        : e2.code === "auth/popup-closed-by-user" ? null
                            : e2.message
            );
        } finally {
            setBusy(false);
        }
    }

    async function submit(e) {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        try {
            setUser(await signInAdmin(email.trim(), password));
            setPassword("");
        } catch (e2) {
            setErr(e2.code === "auth/invalid-credential" ? "Wrong email or password." : e2.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={`mx-auto space-y-6 py-6 ${user ? "max-w-4xl" : "max-w-md"}`}>
            <div>
                <div className="eyebrow">AlkeScan admin</div>
                <h1 className="mt-2 text-2xl font-medium">Publisher sign-in</h1>
                <p className="mt-1 text-sm text-ink-dim">
                    Admins publish verified contract source code and review paid publication requests.
                    Sign in with an account whose email is allowed in the Firestore rules.
                </p>
            </div>
            <Card>
                {user === undefined ? <Loading /> : user ? (
                    <div className="space-y-4">
                        <p className="text-sm">Signed in as <span className="font-medium">{user.email}</span>.</p>
                        <p className="text-sm text-ink-dim">
                            Review paid requests below, or open any contract, verify its source and press <span className="font-medium text-ink">Publish to AlkeScan</span>.
                        </p>
                        <div className="flex gap-2">
                            <Link to="/" className="btn-violet">Go to explorer</Link>
                            <button onClick={async () => { await signOutAdmin(); setUser(null); }} className="btn-ghost">Sign out</button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                    <button type="button" onClick={google} disabled={busy} className="btn-ghost w-full">
                        <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
                        Sign in with Google
                    </button>
                    <div className="flex items-center gap-3 text-xs text-ink-mute"><span className="h-px flex-1 bg-line" />or email and password<span className="h-px flex-1 bg-line" /></div>
                    <form onSubmit={submit} className="space-y-3">
                        <input className="field" type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                        <input className="field" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                        {err && <ErrorBanner title="Sign-in failed" error={err} />}
                        <button type="submit" disabled={busy || !email || !password} className="btn-violet w-full">
                            {busy && <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" />}Sign in
                        </button>
                    </form>
                    </div>
                )}
            </Card>
            {user && (
                <Card title="Contracts waiting for review" flush>
                    <ReviewQueue />
                </Card>
            )}
        </div>
    );
}
