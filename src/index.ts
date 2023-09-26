import { $, Context, Logger, Schema } from "koishi";
import OpenAI from "openai";
import { HttpsProxyAgent } from "https-proxy-agent";
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
  apiKey: Schema.string().required().description("ApiKey"),
  baseURL: Schema.string()
    .required()
    .description("openAI接口地址. 例如'https://api.example.com/v2'"),
  proxy: Schema.string().description("代理. 例如'http://127.0.0.1:7890'"),
  continuousChatCount: Schema.number()
    .default(5)
    .description("最大连续对话数. 例如'5'表示只会取历史最多5条记录参与对话"),
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

  const logger = new Logger("gpt-chat");

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
          const sId = crypto.randomUUID();
          const newS: SessionInfo = {
            userId,
            groupId: channelId,
            msgCount: 0,
            sId,
          };
          sessionList.push(newS);
          nowSession = newS;
          logger.info(
            "创建新对话(新用户和群组): userId: %s, groupId: %s,sessionId: %s",
            userId,
            channelId,
            sId
          );
        } else if (options.new) {
          const sId = crypto.randomUUID();
          const newS: SessionInfo = {
            userId,
            groupId: channelId,
            msgCount: 0,
            sId,
          };
          nowSession = newS;
          logger.info(
            "创建新对话(用户强制开启新对话): userId: %s, groupId: %s,sessionId: %s",
            userId,
            channelId,
            sId
          );
        }

        if (isNil(userId) || isNil(channelId)) {
          return "error: userId | channelId is nil";
        }
        nowSession.msgCount += 1;

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

        logger.info("提问: %s", messages);

        const answer = (await getAnswer(openai, messages)) || "";
        logger.info("回答: \n%s", answer);
        const c: Partial<Chat> = {
          userId,
          groupId: channelId,
          message: msg,
          answer: answer,
          sessionId: nowSession.sId,
          create_time: timestamp,
        };

        ctx.database.create("chat", c);
        return answer;
      } catch (err) {
        logger.info(err);
        return `服务器内部错误${(err as Error).message}`;
      }
    });
}
