//! Epics and stories, modelled on top of `Issue::extension_metadata`.
//!
//! An epic is an issue with `{"kind": "epic"}`. A story is an issue with
//! `{"kind": "story", "epic_id": "<epic issue uuid>"}`. Stories are independent
//! board cards that point at their epic; they are not sub-issues
//! (`parent_issue_id` stays empty). Issues without a kind are plain issues.

use serde_json::{Value, json};
use uuid::Uuid;

pub const ISSUE_KIND_KEY: &str = "kind";
pub const EPIC_ID_KEY: &str = "epic_id";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IssueKind {
    Epic,
    Story,
}

impl IssueKind {
    pub fn as_str(self) -> &'static str {
        match self {
            IssueKind::Epic => "epic",
            IssueKind::Story => "story",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "epic" => Some(IssueKind::Epic),
            "story" => Some(IssueKind::Story),
            _ => None,
        }
    }

    /// Reads the kind from an issue's `extension_metadata`.
    pub fn from_metadata(metadata: &Value) -> Option<Self> {
        metadata
            .get(ISSUE_KIND_KEY)
            .and_then(Value::as_str)
            .and_then(Self::parse)
    }
}

/// Reads the owning epic of a story from its `extension_metadata`.
pub fn epic_id_from_metadata(metadata: &Value) -> Option<Uuid> {
    if IssueKind::from_metadata(metadata) != Some(IssueKind::Story) {
        return None;
    }
    metadata
        .get(EPIC_ID_KEY)
        .and_then(Value::as_str)
        .and_then(|raw| Uuid::parse_str(raw).ok())
}

/// Builds the `extension_metadata` for a new epic or story.
///
/// `epic_id` is only used for stories.
pub fn build_metadata(kind: IssueKind, epic_id: Option<Uuid>) -> Value {
    match (kind, epic_id) {
        (IssueKind::Story, Some(epic_id)) => {
            json!({ ISSUE_KIND_KEY: kind.as_str(), EPIC_ID_KEY: epic_id.to_string() })
        }
        _ => json!({ ISSUE_KIND_KEY: kind.as_str() }),
    }
}

/// Planning statuses are the ones where work has not started yet. Moving an epic
/// to one of them carries its not-yet-started stories along; started or finished
/// stories are never pulled back.
pub fn is_planning_status_name(name: &str) -> bool {
    matches!(
        name.trim().to_ascii_lowercase().as_str(),
        "backlog" | "to do"
    )
}

/// Where an epic should move based on the state of its stories.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EpicRollup {
    InProgress,
    Done,
}

impl EpicRollup {
    /// The status name to look up in the project.
    pub fn status_name(self) -> &'static str {
        match self {
            EpicRollup::InProgress => "In Progress",
            EpicRollup::Done => "Done",
        }
    }
}

fn is_started_status_name(name: &str) -> bool {
    matches!(name, "in progress" | "in testing" | "review" | "done")
}

/// Decides whether an epic should move because of its stories.
///
/// - Every active (non-cancelled) story is Done: the epic becomes Done.
/// - Some story has started and the epic is still in planning, or is Done while a story is
///   not finished: the epic becomes In Progress.
///
/// Roll-up never moves an epic back to a planning status, never touches a cancelled epic and
/// ignores cancelled stories. An epic with no active stories is left alone.
pub fn epic_rollup_target(
    story_status_names: &[&str],
    epic_status_name: &str,
) -> Option<EpicRollup> {
    let epic = epic_status_name.trim().to_ascii_lowercase();
    if epic == "cancelled" {
        return None;
    }

    let active: Vec<String> = story_status_names
        .iter()
        .map(|name| name.trim().to_ascii_lowercase())
        .filter(|name| name != "cancelled")
        .collect();
    if active.is_empty() {
        return None;
    }

    if active.iter().all(|name| name == "done") {
        return (epic != "done").then_some(EpicRollup::Done);
    }

    let any_started = active.iter().any(|name| is_started_status_name(name));
    let epic_needs_progress = is_planning_status_name(&epic) || epic == "done";
    (any_started && epic_needs_progress).then_some(EpicRollup::InProgress)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_kind_from_metadata() {
        assert_eq!(
            IssueKind::from_metadata(&json!({"kind": "epic"})),
            Some(IssueKind::Epic)
        );
        assert_eq!(
            IssueKind::from_metadata(&json!({"kind": "Story"})),
            Some(IssueKind::Story)
        );
        assert_eq!(IssueKind::from_metadata(&json!({})), None);
        assert_eq!(IssueKind::from_metadata(&json!({"kind": "bug"})), None);
        assert_eq!(IssueKind::from_metadata(&Value::Null), None);
    }

    #[test]
    fn story_metadata_round_trips_epic_id() {
        let epic = Uuid::new_v4();
        let metadata = build_metadata(IssueKind::Story, Some(epic));
        assert_eq!(IssueKind::from_metadata(&metadata), Some(IssueKind::Story));
        assert_eq!(epic_id_from_metadata(&metadata), Some(epic));
    }

    #[test]
    fn epics_have_no_epic_id() {
        let metadata = build_metadata(IssueKind::Epic, Some(Uuid::new_v4()));
        assert_eq!(metadata, json!({"kind": "epic"}));
        assert_eq!(epic_id_from_metadata(&metadata), None);
    }

    #[test]
    fn ignores_malformed_epic_id() {
        let metadata = json!({"kind": "story", "epic_id": "not-a-uuid"});
        assert_eq!(epic_id_from_metadata(&metadata), None);
        let metadata = json!({"kind": "epic", "epic_id": Uuid::new_v4().to_string()});
        assert_eq!(epic_id_from_metadata(&metadata), None);
    }

    #[test]
    fn planning_statuses_are_backlog_and_to_do() {
        assert!(is_planning_status_name("Backlog"));
        assert!(is_planning_status_name("To Do"));
        assert!(is_planning_status_name(" to do "));
        assert!(!is_planning_status_name("In Progress"));
        assert!(!is_planning_status_name("Done"));
    }

    #[test]
    fn epic_is_done_when_all_active_stories_are_done() {
        assert_eq!(
            epic_rollup_target(&["Done", "Done"], "In Progress"),
            Some(EpicRollup::Done)
        );
        assert_eq!(epic_rollup_target(&["Done"], "Done"), None);
        // Cancelled stories do not hold the epic back
        assert_eq!(
            epic_rollup_target(&["Done", "Cancelled"], "Review"),
            Some(EpicRollup::Done)
        );
    }

    #[test]
    fn epic_starts_when_a_story_starts() {
        assert_eq!(
            epic_rollup_target(&["In Progress", "To Do"], "To Do"),
            Some(EpicRollup::InProgress)
        );
        assert_eq!(
            epic_rollup_target(&["Review", "Backlog"], "Backlog"),
            Some(EpicRollup::InProgress)
        );
        // Already moving: leave the epic where it is (including In Testing and Review)
        assert_eq!(epic_rollup_target(&["In Progress"], "In Progress"), None);
        assert_eq!(epic_rollup_target(&["In Progress"], "Review"), None);
    }

    #[test]
    fn done_epic_reopens_when_a_story_is_not_finished() {
        assert_eq!(
            epic_rollup_target(&["Done", "To Do"], "Done"),
            Some(EpicRollup::InProgress)
        );
        assert_eq!(
            epic_rollup_target(&["Done", "In Progress"], "Done"),
            Some(EpicRollup::InProgress)
        );
    }

    #[test]
    fn rollup_never_moves_an_epic_back_to_planning_or_touches_cancelled() {
        assert_eq!(
            epic_rollup_target(&["To Do", "Backlog"], "In Progress"),
            None
        );
        assert_eq!(epic_rollup_target(&["To Do"], "To Do"), None);
        assert_eq!(epic_rollup_target(&["Done"], "Cancelled"), None);
        assert_eq!(epic_rollup_target(&["In Progress"], "Cancelled"), None);
    }

    #[test]
    fn epic_without_active_stories_is_left_alone() {
        assert_eq!(epic_rollup_target(&[], "To Do"), None);
        assert_eq!(epic_rollup_target(&["Cancelled"], "In Progress"), None);
    }
}
