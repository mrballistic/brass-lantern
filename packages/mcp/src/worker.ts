// The worker entry: runs one audit_world or play job (workerData) and posts the result back.
// Its stdout and stderr are piped to the server's stderr, and run.ts terminates it on the deadline.
import { parentPort, workerData } from 'node:worker_threads';
import * as bundled from '@brass-lantern/engine';
import { runJob, type Job } from './job.ts';

parentPort?.postMessage(await runJob(workerData as Job, bundled));
