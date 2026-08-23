import React, { useState, useEffect, ReactNode } from 'react';

interface PasswordGateProps {
  children: ReactNode;
  passwordHash: string; // SHA-256 해시값
  storageKey?: string;
}

// 표준 SHA-256 함수
async function sha256(message: string): Promise<string> {
  const normalized = message.trim().normalize('NFC');
  const msgBuffer = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function PasswordGate({
  children,
  passwordHash,
  storageKey = 'docusaurus_auth_pass',
}: PasswordGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [inputPass, setInputPass] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === 'true') {
        setIsAuthenticated(true);
      }
    }
  }, [storageKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPass.trim()) return;

    const calculatedHash = await sha256(inputPass);
    const targetHash = passwordHash.trim().toLowerCase();

    if (calculatedHash.toLowerCase() === targetHash) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(storageKey, 'true');
      }
      setIsAuthenticated(true);
      setErrorMsg('');
    } else {
      setErrorMsg('❌ 비밀번호가 올바르지 않습니다.');
      setInputPass('');
    }
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        margin: '2rem 0',
        padding: '2.5rem 1.5rem',
        borderRadius: '12px',
        border: '1px solid #334155',
        background: '#0f172a',
        textAlign: 'center',
        color: '#f8fafc',
      }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '0.8rem' }}>🔒</div>
      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem', color: '#f8fafc' }}>
        보호된 문서입니다
      </h3>
      <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        이 콘텐츠를 확인하려면 접근 권한 비밀번호를 입력해주세요.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          maxWidth: '360px',
          margin: '0 auto',
        }}>
        <input
          type="password"
          value={inputPass}
          onChange={(e) => setInputPass(e.target.value)}
          placeholder="비밀번호 입력..."
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid #475569',
            background: '#1e293b',
            color: '#fff',
            outline: 'none',
          }}
          autoFocus
        />
        <button
          type="submit"
          className="button button--primary"
          style={{ padding: '10px 18px', fontWeight: 600 }}>
          인증
        </button>
      </form>

      {errorMsg && (
        <p style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '1rem', fontWeight: 600 }}>
          {errorMsg}
        </p>
      )}
    </div>
  );
}