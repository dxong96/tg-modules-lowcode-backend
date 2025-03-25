import {Collection, MongoClient} from "mongodb";
import {UploadedFile} from "./model/file.js";
import {Project} from "./model/project.js";

interface Collections {
  files: Collection<UploadedFile>;
  projects: Collection<Project>;
}

let collections: Collections | null = null;

export async function connectToDb() {
  const client = new MongoClient(process.env.MONGODB_URL!);
  await client.connect();
  const db = client.db();

  collections = {
    files: db.collection('files'),
    projects: db.collection('projects')
  };
}

export function dbCollection<T extends keyof Collections>(collectionName: T): Collections[T] {
  if (!collections) {
    throw new Error("Database connection not initialized");
  }

  return collections[collectionName];
}