// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-05 — Tag Entries. A single infinite-scroll grid, same paging shape as SCR-02's feed tabs.

import { Tag } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState.js';
import { IonPage, IonHeader, IonContent, IonSpinner } from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { usePagedResource } from '../../data/usePagedResource.js';
import { fetchTagPage, PAGE_SIZE } from '../../data/entries.js';
import { isSearchableTag } from '../../data/tagSearch.js';
import { t } from '../../strings/index.js';
import { EntryGrid } from '../../components/EntryGrid.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { LoadFailed } from '../../components/LoadFailed.js';

interface TagEntriesScreenProps {
  tag: string;
}

export function TagEntriesScreen({ tag }: TagEntriesScreenProps) {
  const navigate = useAppNavigate();
  const activeAccount = useActiveAccount();
  // Back from an entry rebuilds this screen — remember the page you were on (b-oss#182).
  const resumeKey = `tag:${activeAccount?.id ?? 'anon'}:${tag}`;
  const searchable = isSearchableTag(tag);
  const resource = usePagedResource(
    // An unsearchable tag makes no request; the empty state below explains why.
    (pageIndex) =>
      searchable ? fetchTagPage(tag, pageIndex) : Promise.resolve({ items: [], more: false }),
    [tag],
    PAGE_SIZE,
    resumeKey,
  );

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title={`#${tag}`} variant="back" backHref="/browse" accountIndicator />
      </IonHeader>
      <IonContent>
        {resource.status === 'loading' && (
          <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner />
          </div>
        )}
        {resource.status === 'error' && (
          <LoadFailed
            transport={resource.errorIsTransport}
            message={resource.errorMessage}
            onRefresh={resource.refresh}
          />
        )}
        {resource.status === 'empty' && (
          <EmptyState
            icon={<Tag size={40} strokeWidth={1.5} />}
            title={searchable ? `No entries tagged ‘${tag}’.` : t('SCR-05.unsearchable')}
          />
        )}
        {resource.status === 'loaded' && (
          <EntryGrid
            entries={resource.items}
            onSelectEntry={(id) => navigate.push(`/entry/${id}`)}
            hasMore={resource.hasMore}
            onLoadMore={resource.loadMore}
            onRefresh={resource.refresh}
            entriesOffset={resource.windowStart}
            onSeek={resource.seekTo}
            onLoadBefore={resource.loadBefore}
            resumeKey={resumeKey}
            lastPageIndex={resource.lastPageIndex}
            navSource={{
              label: `#${tag}`,
              detail: `Tag #${tag}`,
              fetchPage: (pageIndex) => fetchTagPage(tag, pageIndex),
              pageSize: PAGE_SIZE,
            }}
          />
        )}
      </IonContent>
    </IonPage>
  );
}
