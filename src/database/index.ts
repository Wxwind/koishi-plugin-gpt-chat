declare module "koishi" {
  interface Tables {
    chat: Chat;
  }
}

export interface Chat {
  id: number;
  sessionId: string;
  userId: string;
  groupId: string;
  message: string;
  answer: string;
  create_time: number;
}
