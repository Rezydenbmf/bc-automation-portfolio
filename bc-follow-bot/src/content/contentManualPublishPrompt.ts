import readline from "node:readline/promises";
import type { Readable, Writable } from "node:stream";

export type PromptQuestion = (question: string) => Promise<string>;

export interface PromptSession {
  question: PromptQuestion;
  close: () => void;
}

function isInteractiveInput(input: Readable): boolean {
  return (input as Readable & { isTTY?: boolean }).isTTY === true;
}

async function readPipedInputLines(input: Readable): Promise<string[]> {
  const chunks: Buffer[] = [];

  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  const text = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

export async function createPromptSession(input: Readable, output: Writable): Promise<PromptSession> {
  if (!isInteractiveInput(input)) {
    const answers = await readPipedInputLines(input);
    let nextAnswerIndex = 0;

    return {
      question: async (question) => {
        output.write(question);
        const answer = answers[nextAnswerIndex] ?? "";
        nextAnswerIndex += 1;
        output.write("\n");
        return answer;
      },
      close: () => {}
    };
  }

  const rl = readline.createInterface({ input, output });
  return {
    question: (question) => rl.question(question),
    close: () => rl.close()
  };
}
