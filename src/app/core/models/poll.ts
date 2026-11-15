export interface PollOption {
  id: string;
  label: string;
}
export interface PollQuestion {
  id: string;
  text: string;
  options: readonly PollOption[];
}
export interface Poll {
  id: string;
  title: string;
  description: string;
  questions: readonly PollQuestion[];
}
