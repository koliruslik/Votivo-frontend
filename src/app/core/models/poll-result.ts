export interface OptionResult {
  optionId: string;
  votes: number;
  percentage: number;
}
export interface QuestionResult {
  questionId: string;
  answeredVotes: number;
  options: OptionResult[];
}
export interface PollResult {
  pollId: string;
  totalVotes: number;
  questions: QuestionResult[];
}
