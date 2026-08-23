import React, { useState, useEffect, ReactNode } from 'react';

interface PasswordGateProps {
  children: ReactNode;
  passwordHash: string; // SHA-256 해시값
  storageKey?: string;
}

// 브라우저 기본 Web Crypto API를 사용한 SHA-256 해싱 함수 (외부 라이브러리 불필요)
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
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
    // 세션 스토리지에 기존 인증 기록이 있는지 체크
    const saved = sessionStorage.getItem(storageKey);
    if (saved === 'true') {
      setIsAuthenticated(true);
    }
  }, [storageKey]);

const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 앞뒤 공백 자동 제거 및 소문자 정규화
    const cleanInput = inputPass.trim();
    const hashed = await sha256(cleanInput);

    if (hashed.toLowerCase() === passwordHash.trim().toLowerCase()) {
      sessionStorage.setItem(storageKey, 'true');
      setIsAuthenticated(true);
      setErrorMsg('');
    } else {
      setErrorMsg('❌ 비밀번호가 올바르지 않습니다.');
      setInputPass('');
    }
  };

  // 인증 완료 시 원래 마크다운/문서 내용 표시
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // 인증 전 비밀번호 입력 화면
  return (
    <div
      style={{
        margin: '2rem 0',
        padding: '2.5rem',
        borderRadius: '12px',
        border: '1px solid #334155',
        background: '#0f172a',
        textAlign: 'center',
        color: '#f8fafc',
      }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.4rem' }}>
        보호된 문서입니다
      </h3>
      <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
        이 콘텐츠를 확인하려면 접근 권한 비밀번호를 입력해주세요.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          maxWidth: '350px',
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
        <p style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '1rem' }}>
          {errorMsg}
        </p>
      )}
    </div>
  );
}