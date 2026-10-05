use api_types::{
    CreateIssueRelationshipRequest, IssueRelationship, IssueRelationshipType, MutationResponse,
};
use rmcp::{
    ErrorData, handler::server::wrapper::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::McpServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpCreateIssueRelationshipRequest {
    #[schemars(description = "The source issue ID")]
    issue_id: Uuid,
    #[schemars(description = "The related issue ID")]
    related_issue_id: Uuid,
    #[schemars(
        description = "Relationship type: 'depends_on' (issue_id depends on related_issue_id, so related_issue_id must be finished first), 'blocking' (issue_id blocks related_issue_id), 'related', or 'has_duplicate'"
    )]
    relationship_type: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpCreateIssueRelationshipResponse {
    relationship_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpDeleteIssueRelationshipRequest {
    #[schemars(
        description = "The relationship ID to delete (from get_issue or create_issue_relationship)"
    )]
    relationship_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpDeleteIssueRelationshipResponse {
    success: bool,
    deleted_relationship_id: String,
}

#[tool_router(router = issue_relationships_tools_router, vis = "pub")]
impl McpServer {
    #[tool(
        description = "Create a relationship between two issues. Types: 'depends_on' (issue_id depends on related_issue_id; use this for 'ticket 2 depends on ticket 1'), 'blocking', 'related', 'has_duplicate'."
    )]
    async fn create_issue_relationship(
        &self,
        Parameters(McpCreateIssueRelationshipRequest {
            issue_id,
            related_issue_id,
            relationship_type,
        }): Parameters<McpCreateIssueRelationshipRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // `depends_on` is stored as `blocking` in the opposite direction.
        let (issue_id, related_issue_id, relationship_type) = match relationship_type
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "depends_on" | "depends-on" => {
                (related_issue_id, issue_id, IssueRelationshipType::Blocking)
            }
            "blocking" => (issue_id, related_issue_id, IssueRelationshipType::Blocking),
            "related" => (issue_id, related_issue_id, IssueRelationshipType::Related),
            "has_duplicate" => (
                issue_id,
                related_issue_id,
                IssueRelationshipType::HasDuplicate,
            ),
            other => {
                return Ok(Self::tool_error(super::ToolError::message(format!(
                    "Unknown relationship_type '{}'. Allowed values: ['depends_on', 'blocking', 'related', 'has_duplicate']",
                    other
                ))));
            }
        };

        let payload = CreateIssueRelationshipRequest {
            id: None,
            issue_id,
            related_issue_id,
            relationship_type,
        };

        let url = self.url("/api/remote/issue-relationships");
        let response: MutationResponse<IssueRelationship> =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(r) => r,
                Err(e) => return Ok(Self::tool_error(e)),
            };

        McpServer::success(&McpCreateIssueRelationshipResponse {
            relationship_id: response.data.id.to_string(),
        })
    }

    #[tool(description = "Delete a relationship between two issues.")]
    async fn delete_issue_relationship(
        &self,
        Parameters(McpDeleteIssueRelationshipRequest { relationship_id }): Parameters<
            McpDeleteIssueRelationshipRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!(
            "/api/remote/issue-relationships/{}",
            relationship_id
        ));
        if let Err(e) = self.send_empty_json(self.client.delete(&url)).await {
            return Ok(Self::tool_error(e));
        }

        McpServer::success(&McpDeleteIssueRelationshipResponse {
            success: true,
            deleted_relationship_id: relationship_id.to_string(),
        })
    }
}
