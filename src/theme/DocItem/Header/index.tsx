import React, { type ComponentProps, type ReactNode } from 'react';
import Header from '@theme-original/DocItem/Header';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import AuthorHeader from '@site/src/components/AuthorHeader';

type Props = ComponentProps<typeof Header>;

interface CustomDocFrontMatter {
  hide_author?: boolean;
  date?: string;
  reading_time?: string;
  author?: string;
  [key: string]: unknown;
}

export default function HeaderWrapper(props: Props): ReactNode {
  const { frontMatter } = useDoc();
  const customFrontMatter = frontMatter as CustomDocFrontMatter;

  // hide_author: true 로 설정된 문서는 제외 (예: intro 문서 등)
  const hideAuthor = customFrontMatter.hide_author === true;

  // frontmatter에 지정된 값이 있으면 사용하고, 없으면 기본값 적용
  const date = customFrontMatter.date || '2026년 8월 24일';
  const readingTime = customFrontMatter.reading_time || '약 5분';
  const author = customFrontMatter.author || 'deejay';

  return (
    <>
      <Header {...props} />
      {!hideAuthor && (
        <AuthorHeader
          author={author}
          date={date}
          readingTime={readingTime}
        />
      )}
    </>
  );
}
