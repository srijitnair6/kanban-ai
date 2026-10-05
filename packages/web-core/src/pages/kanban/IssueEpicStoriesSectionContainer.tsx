import { useCallback, useMemo } from 'react';
import { useParams } from '@tanstack/react-router';
import { PlusIcon } from '@phosphor-icons/react';
import { useProjectContext } from '@/shared/hooks/useProjectContext';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { useCurrentKanbanRouteState } from '@/shared/hooks/useCurrentKanbanRouteState';
import { CollapsibleSectionHeader } from '@vibe/ui/components/CollapsibleSectionHeader';
import {
  getEpicProgress,
  isEpic,
  isPlanningStatusName,
  groupStoriesByEpic,
} from '@/shared/lib/issueKind';
import {
  buildKanbanIssueComposerKey,
  openKanbanIssueComposer,
} from '@/shared/stores/useKanbanIssueComposerStore';
import { IssueSubIssuesSectionContainer } from './IssueSubIssuesSectionContainer';

interface IssueEpicStoriesSectionContainerProps {
  issueId: string;
}

/** The stories that belong to an epic, with progress and an "add story" action. */
export function IssueEpicStoriesSectionContainer({
  issueId,
}: IssueEpicStoriesSectionContainerProps) {
  const { projectId } = useParams({ strict: false });
  const appNavigation = useAppNavigation();
  const routeState = useCurrentKanbanRouteState();
  const { issues, issuesById, statuses } = useProjectContext();

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  );
  const statusesById = useMemo(
    () => new Map(statuses.map((s) => [s.id, s])),
    [statuses]
  );
  const doneStatusIds = useMemo(() => {
    const visible = sortedStatuses.filter((s) => !s.hidden);
    const last = visible[visible.length - 1];
    return new Set(last ? [last.id] : []);
  }, [sortedStatuses]);

  const stories = useMemo(
    () =>
      [...(groupStoriesByEpic(issues).get(issueId) ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order || a.issue_number - b.issue_number
      ),
    [issues, issueId]
  );
  const progress = getEpicProgress(stories, doneStatusIds);

  const handleAddStory = useCallback(() => {
    if (!projectId) return;
    const epic = issuesById.get(issueId);
    const epicStatus = epic ? statusesById.get(epic.status_id) : undefined;
    // New stories start where the epic is while it is still being planned,
    // otherwise in the first board column.
    const firstVisible = sortedStatuses.find((s) => !s.hidden);
    const statusId =
      epicStatus && isPlanningStatusName(epicStatus.name)
        ? epicStatus.id
        : firstVisible?.id;
    openKanbanIssueComposer(
      buildKanbanIssueComposerKey(routeState.hostId, projectId),
      { issueKind: 'story', epicId: issueId, statusId }
    );
  }, [
    projectId,
    issueId,
    issuesById,
    statusesById,
    sortedStatuses,
    routeState.hostId,
  ]);

  const handleOpenStory = useCallback(
    (storyId: string) => {
      if (projectId) appNavigation.goToProjectIssue(projectId, storyId);
    },
    [projectId, appNavigation]
  );

  return (
    <CollapsibleSectionHeader
      title={`Stories (${progress.done}/${progress.total} done)`}
      persistKey="kanban-issue-epic-stories"
      defaultExpanded={true}
      actions={[{ icon: PlusIcon, onClick: handleAddStory }]}
    >
      <div className="p-base flex flex-col gap-half border-t">
        {stories.length === 0 ? (
          <p className="text-low py-half">No stories yet</p>
        ) : (
          stories.map((story) => {
            const status = statusesById.get(story.status_id);
            return (
              <button
                key={story.id}
                type="button"
                onClick={() => handleOpenStory(story.id)}
                className="flex min-w-0 items-center gap-base rounded-sm px-half py-half text-left hover:bg-secondary"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: status
                      ? `hsl(${status.color})`
                      : 'currentColor',
                  }}
                  title={status?.name}
                />
                <span className="font-ibm-plex-mono text-sm text-low shrink-0">
                  {story.simple_id}
                </span>
                <span className="truncate text-base text-normal">
                  {story.title}
                </span>
                {status && (
                  <span className="ml-auto shrink-0 text-sm text-low">
                    {status.name}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </CollapsibleSectionHeader>
  );
}

/** Epics list their stories; every other issue keeps the regular sub-issues section. */
export function IssueStoriesOrSubIssuesSection({
  issueId,
}: {
  issueId: string;
}) {
  const { issuesById } = useProjectContext();
  const issue = issuesById.get(issueId);
  if (issue && isEpic(issue)) {
    return <IssueEpicStoriesSectionContainer issueId={issueId} />;
  }
  return <IssueSubIssuesSectionContainer issueId={issueId} />;
}
