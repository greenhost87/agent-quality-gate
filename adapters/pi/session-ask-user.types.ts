export type SessionBranchEntry = {
  type?: string;
  message?: {
    role?: string;
    content?: object | string;
  };
};
