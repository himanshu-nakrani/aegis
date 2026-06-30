import { api } from "@/lib/api";

export type JobStatus = Awaited<ReturnType<typeof api.getJob>>;

export async function pollJob(jobId: string, maxAttempts = 60): Promise<JobStatus> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const job = await api.getJob(jobId);
    if (job.status === "completed" || job.status === "failed") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Job timed out");
}