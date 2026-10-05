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
}
