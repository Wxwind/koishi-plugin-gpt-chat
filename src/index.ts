import { $, Context, Schema } from "koishi";
import OpenAI from "openai";
import { HttpsProxyAgent } from "https-proxy-agent";
import "reflect-metadata";
import { getAnswer } from "./openai";
import { Chat } from "./database";
import { CreateChatCompletionRequestMessage } from "openai/resources/chat";
import { isNil } from "./utils";
import { SessionInfo } from "./interface";
import crypto from "crypto";

export const name = "gpt-chat";

export interface Config {
  apiKey: string;
  baseURL: string;
  proxy: string;
  continuousChatCount: number;
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string(),
  baseURL: Schema.string(),
  proxy: Schema.string(),
  continuousChatCount: Schema.number(),
});

export function apply(ctx: Context, config: Config) {
  const httpAgent =
    config.proxy !== "" ? new HttpsProxyAgent(config.proxy) : undefined;

  const sessionList: SessionInfo[] = [];

  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    httpAgent: httpAgent,
  });

  ctx.model.extend(
    "chat",
    {
      id: "integer",
      sessionId: "string",
      userId: "string",
      groupId: "string",
      message: "string",
      answer: "string",
      create_time: "integer",
    },
    { primary: "id", autoInc: true }
  );

  ctx
    .command("chat <msg:string>", "chat with gpt-3.5-turbo")
    .option("new", "-n 创建一个全新对话", { fallback: false })
    .usage("注意：如果聊天信息带有空格请使用双引号“”包裹")
    .action(async ({ options, session }, msg) => {
      try {
        if (!session) {
          return `error: session is null`;
        }
        if (session.isDirect) {
          return "warn: 该命令仅支持在群组内访问";
        }
        const { userId, channelId, timestamp } = session;
        let nowSession = sessionList.find((a) => {
          return a.groupId === channelId && a.userId === userId;
        });
        if (isNil(nowSession)) {
          const newS: SessionInfo = {
            userId,
            groupId: channelId,
            msgCount: 0,
            sId: crypto.randomUUID(),
          };
          sessionList.push(newS);
          nowSession = newS;
        } else if (
          nowSession.msgCount >= config.continuousChatCount ||
          options.new
        ) {
          const newS: SessionInfo = {
            userId,
            groupId: channelId,
            msgCount: 0,
            sId: crypto.randomUUID(),
          };
          nowSession = newS;
        }

        if (isNil(userId) || isNil(channelId)) {
          return "error: userId | channelId is nil";
        }

        // search history
        const q = await ctx.database
          .select("chat")
          .where({ userId: { $eq: nowSession.userId } })
          .where({ groupId: { $eq: nowSession.groupId } })
          .where({ sessionId: { $eq: nowSession.sId } })
          .orderBy("create_time", "desc")
          .limit(config.continuousChatCount)
          .execute();

        const messages: CreateChatCompletionRequestMessage[] = [];

        for (const c of q) {
          const a: CreateChatCompletionRequestMessage = {
            role: "user",
            content: c.message,
          };

          const b: CreateChatCompletionRequestMessage = {
            role: "assistant",
            content: c.answer,
          };
          messages.push(a);
          messages.push(b);
        }

        messages.push({
          role: "user",
          content: msg,
        });

        console.log("提问", messages);

        const answer = (await getAnswer(openai, messages)) || "";
        const c: Partial<Chat> = {
          userId,
          groupId: channelId,
          message: msg,
          answer: answer,
          sessionId: nowSession.sId,
          create_time: timestamp,
        };

        console.log("回答", answer);
        ctx.database.create("chat", c);
        return answer;
      } catch (err) {
        console.error((err as Error).message);
        return `服务器内部错误${(err as Error).message}`;
      }
    });
}
