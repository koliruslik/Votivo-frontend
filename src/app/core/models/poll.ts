export type PollStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';
export interface PollSummary {
  id: string;
  title: string;
  status: PollStatus;
  accessType: 'PUBLIC' | 'LINK';
  anonymous: boolean;
  blocked: boolean;
  createdAt: string;
}
export interface Poll extends PollSummary {
  ownerId: string;
  description: string;
  allowVoteChange: boolean;
  shareToken: string | null;
  questions: Question[];
}
export interface Question {
  id: string;
  text: string;
  type: 'SINGLE' | 'MULTIPLE';
  options: { id: string; text: string }[];
}
export interface PollInput {
  title: string;
  description: string;
  accessType: 'PUBLIC' | 'LINK';
  anonymous: boolean;
  allowVoteChange: boolean;
  questions: { text: string; type: 'SINGLE' | 'MULTIPLE'; options: { text: string }[] }[];
}
export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
export interface VoteAnswer {
  question_id: string;
  option_ids: string[];
}
export interface VoteStatus {
  voted: boolean;
  answers?: VoteAnswer[] | null;
}
export interface PollResult {
  pollId: string;
  title: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'BLOCKED' | 'UNKNOWN';
  totalVotes: number;
  questions: {
    questionId: string;
    text: string;
    multiple: boolean;
    options: { optionId: string; text: string; votes: number }[];
  }[];
}
