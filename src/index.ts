import { Context, Schema } from "koishi";
import OpenAI from "openai";
import { HttpsProxyAgent } from "https-proxy-agent";
export const name = "gpt-chat";

export interface Config {
  apiKey: string;
  baseURL: string;
  proxy: string;
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string(),
  baseURL: Schema.string(),
  proxy: Schema.string(),
});

export const getAnswer = async (openai: OpenAI, msg: string) => {
  try {
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: msg }],
    });
    return chatCompletion.choices[0].message.content;
  } catch (err) {
    console.error((err as Error).message);
    return `服务器内部错误${(err as Error).message}`;
  }
};

async function createImages(openai: OpenAI, msg: string) {
  try {
    const result = await openai.images.generate({
      prompt: msg,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    });
    return result.data;
  } catch (err) {
    console.error((err as Error).message);
    return `服务器内部错误${(err as Error).message}`;
  }
}

export function apply(ctx: Context, config: Config) {
  const httpAgent =
    config.proxy !== "" ? new HttpsProxyAgent(config.proxy) : undefined;

  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    httpAgent: httpAgent,
  });
  ctx
    .command("chat [arg:string]", "chat gpt")
    .action(({ options, session }, arg) => {
      console.log("msg ", arg);

      if (session.isDirect) {
        return "该命令仅支持在群组内访问";
      }
      return getAnswer(openai, arg);
    });
}
