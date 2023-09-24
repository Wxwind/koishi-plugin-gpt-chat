import OpenAI from "openai";
import { CreateChatCompletionRequestMessage } from "openai/resources/chat";

export const getAnswer = async (
  openai: OpenAI,
  messages: CreateChatCompletionRequestMessage[]
) => {
  const chatCompletion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages,
  });
  return chatCompletion.choices[0].message.content;
};

export async function createImages(openai: OpenAI, msg: string) {
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
