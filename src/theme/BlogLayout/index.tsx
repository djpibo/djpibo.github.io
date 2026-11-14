import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import BlogSidebar from '@theme/BlogSidebar';
import type {Props} from '@theme/BlogLayout';
import styles from './styles.module.css';

export default function BlogLayout(props: Props): ReactNode {
  const {sidebar, toc, children, ...layoutProps} = props;
  const hasSidebar = sidebar && sidebar.items.length > 0;

  return (
    <Layout {...layoutProps}>
      <div className={styles.blogWrapper}>
        <div className={styles.blogRoot}>
          {hasSidebar && (
            <div className={styles.blogSidebarWrapper}>
              <BlogSidebar sidebar={sidebar} />
            </div>
          )}
          <div
            className={clsx(
              styles.blogMainContainer,
              !hasSidebar && styles.blogMainContainerFull,
            )}>
            <div
              className={clsx(
                'container padding-top--md padding-bottom--lg',
                styles.blogItemWrapper,
              )}>
              <div className="row">
                <main
                  className={clsx(
                    'col',
                    toc ? styles.blogItemCol : styles.blogListCol,
                  )}
                  itemScope
                  itemType="https://schema.org/Blog">
                  {children}
                </main>
                {toc && <div className="col col--3">{toc}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
