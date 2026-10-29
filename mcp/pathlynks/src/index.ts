export {
  createPathlynksPort,
  createVidyseaPort,
  type VidyseaPort,
  type VidyseaPortConfig,
  ROW_CAP,
  STATEMENT_TIMEOUT_MS,
  type PathlynksPort,
  type PathlynksPortConfig,
  type PathlynksResult,
  type PathlynksRow,
  type PathlynksEvent,
  type UnavailableCause,
  type PgClientLike,
  type ConnectFn,
  // wire-fix-1 (D-134): the Career Quest read-only reader and the shapes a Mongo opener must satisfy.
  createQuestReader,
  QUEST_DB_NAME,
  QUEST_COLLECTIONS,
  QUEST_MAX_TIME_MS,
  QUEST_READ_PREFERENCE,
  type QuestCollectionName,
  type QuestCollectionLike,
  type QuestCursorLike,
  type QuestDbLike,
  type QuestReader,
} from "./port.js";
export { buildPgConfig, type PgCredentialBinding, type PgConnectionConfig, type PgDriverConfig } from "./connect.js";
export { createPathlynksServer } from "./server.js";
