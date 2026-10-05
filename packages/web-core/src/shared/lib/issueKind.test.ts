import { describe, it, expect } from 'vitest';
import type { Issue } from 'shared/remote-types';
import {
  buildIssueMetadata,
  getEpicId,
  getEpicProgress,
  getIssueKind,
  groupStoriesByEpic,
  isPlanningStatusName,
  matchesEntityView,
} from './issueKind';

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'i1',
    project_id: 'p1',
    issue_number: 1,
    simple_id: 'DG-1',
    status_id: 's-todo',
    title: 'title',
    description: null,
    priority: null,
    start_date: null,
    target_date: null,
    completed_at: null,
    sort_order: 0,
    parent_issue_id: null,
    parent_issue_sort_order: null,
    extension_metadata: {},
    creator_user_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('getIssueKind', () => {
  it('reads epic and story kinds, case-insensitively', () => {
    expect(getIssueKind(issue({ extension_metadata: { kind: 'epic' } }))).toBe(
      'epic'
    );
    expect(getIssueKind(issue({ extension_metadata: { kind: 'Story' } }))).toBe(
      'story'
    );
  });

  it('treats missing, malformed or unknown metadata as a plain issue', () => {
    expect(getIssueKind(issue({ extension_metadata: {} }))).toBeNull();
    expect(getIssueKind(issue({ extension_metadata: null }))).toBeNull();
    expect(getIssueKind(issue({ extension_metadata: [] }))).toBeNull();
    expect(getIssueKind(issue({ extension_metadata: 'epic' }))).toBeNull();
    expect(getIssueKind(issue({ extension_metadata: { kind: 'bug' } }))).toBe(
      null
    );
    expect(getIssueKind(issue({ extension_metadata: { kind: 3 } }))).toBeNull();
  });
});

describe('getEpicId', () => {
  it('returns the epic of a story', () => {
    expect(
      getEpicId(
        issue({ extension_metadata: { kind: 'story', epic_id: 'epic-1' } })
      )
    ).toBe('epic-1');
  });

  it('ignores epic_id on non-stories and empty ids', () => {
    expect(
      getEpicId(
        issue({ extension_metadata: { kind: 'epic', epic_id: 'epic-1' } })
      )
    ).toBeNull();
    expect(
      getEpicId(issue({ extension_metadata: { kind: 'story', epic_id: '' } }))
    ).toBeNull();
    expect(getEpicId(issue())).toBeNull();
  });
});

describe('buildIssueMetadata', () => {
  it('builds epic and story metadata that round-trips', () => {
    expect(buildIssueMetadata('epic', 'ignored')).toEqual({ kind: 'epic' });
    const story = buildIssueMetadata('story', 'epic-9');
    expect(story).toEqual({ kind: 'story', epic_id: 'epic-9' });
    expect(getEpicId(issue({ extension_metadata: story }))).toBe('epic-9');
  });

  it('returns null for plain issues', () => {
    expect(buildIssueMetadata(null)).toBeNull();
  });
});

describe('matchesEntityView', () => {
  it('shows only epics in the epic view', () => {
    const epic = issue({ extension_metadata: { kind: 'epic' } });
    const story = issue({
      extension_metadata: { kind: 'story', epic_id: 'e' },
    });
    expect(matchesEntityView(epic, 'epics')).toBe(true);
    expect(matchesEntityView(story, 'epics')).toBe(false);
    expect(matchesEntityView(issue(), 'epics')).toBe(false);
  });

  it('shows stories and plain issues in the story view, never epics', () => {
    const epic = issue({ extension_metadata: { kind: 'epic' } });
    const story = issue({
      extension_metadata: { kind: 'story', epic_id: 'e' },
    });
    expect(matchesEntityView(epic, 'stories')).toBe(false);
    expect(matchesEntityView(story, 'stories')).toBe(true);
    expect(matchesEntityView(issue(), 'stories')).toBe(true);
  });
});

describe('epic grouping and progress', () => {
  const stories = [
    issue({
      id: 'a',
      status_id: 's-done',
      extension_metadata: { kind: 'story', epic_id: 'e1' },
    }),
    issue({
      id: 'b',
      status_id: 's-todo',
      extension_metadata: { kind: 'story', epic_id: 'e1' },
    }),
    issue({
      id: 'c',
      status_id: 's-done',
      extension_metadata: { kind: 'story', epic_id: 'e2' },
    }),
    issue({ id: 'd', extension_metadata: { kind: 'epic' } }),
  ];

  it('groups stories under their epic and skips everything else', () => {
    const grouped = groupStoriesByEpic(stories);
    expect(grouped.get('e1')?.map((s) => s.id)).toEqual(['a', 'b']);
    expect(grouped.get('e2')?.map((s) => s.id)).toEqual(['c']);
    expect(grouped.size).toBe(2);
  });

  it('counts finished stories', () => {
    const done = new Set(['s-done']);
    expect(
      getEpicProgress(groupStoriesByEpic(stories).get('e1')!, done)
    ).toEqual({ done: 1, total: 2 });
    expect(getEpicProgress([], done)).toEqual({ done: 0, total: 0 });
  });
});

describe('isPlanningStatusName', () => {
  it('matches the not-yet-started statuses only', () => {
    expect(isPlanningStatusName('Backlog')).toBe(true);
    expect(isPlanningStatusName('To Do')).toBe(true);
    expect(isPlanningStatusName(' to do ')).toBe(true);
    expect(isPlanningStatusName('In Progress')).toBe(false);
    expect(isPlanningStatusName('Done')).toBe(false);
  });
});
