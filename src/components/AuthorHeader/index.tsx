import React, { ReactNode } from 'react';
import Link from '@docusaurus/Link';

interface AuthorProfile {
  name: string;
  title: string;
  url?: string;
  image_url: string;
}

const AUTHORS_DATA: Record<string, AuthorProfile> = {
  deejay: {
    name: 'Dongju Lee',
    title: 'Oracle DBA & AI Architecture Specialist',
    url: 'https://github.com/djpibo',
    image_url: 'https://github.com/djpibo.png',
  },
};

interface AuthorHeaderProps {
  author?: string;
  date?: string;
  readingTime?: string;
  name?: string;
  title?: string;
  url?: string;
  imageUrl?: string;
}

export default function AuthorHeader({
  author = 'deejay',
  date = '2026년 8월 24일',
  readingTime = '약 5분',
  name,
  title,
  url,
  imageUrl,
}: AuthorHeaderProps): ReactNode {
  const profile = AUTHORS_DATA[author] || AUTHORS_DATA.deejay;
  const authorName = name || profile.name;
  const authorTitle = title || profile.title;
  const authorUrl = url || profile.url;
  const authorImg = imageUrl || profile.image_url;

  return (
    <div style={{
      marginBottom: '2rem',
      paddingBottom: '1.2rem',
      borderBottom: '1px solid var(--ifm-color-emphasis-200)',
    }}>
      {(date || readingTime) && (
        <div style={{
          fontSize: '0.875rem',
          color: 'var(--ifm-color-emphasis-600)',
          marginBottom: '0.75rem',
          fontWeight: 500,
        }}>
          {date}
          {date && readingTime && ' · '}
          {readingTime}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        {authorImg && (
          <img
            src={authorImg}
            alt={authorName}
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid var(--ifm-color-primary)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            }}
          />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.3' }}>
          {authorUrl ? (
            <Link
              to={authorUrl}
              style={{
                fontWeight: 700,
                fontSize: '1.05rem',
                color: 'var(--ifm-color-primary)',
                textDecoration: 'none',
              }}>
              {authorName}
            </Link>
          ) : (
            <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--ifm-heading-color)' }}>
              {authorName}
            </span>
          )}
          {authorTitle && (
            <span style={{
              fontSize: '0.83rem',
              color: 'var(--ifm-color-emphasis-600)',
              marginTop: '2px',
            }}>
              {authorTitle}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
