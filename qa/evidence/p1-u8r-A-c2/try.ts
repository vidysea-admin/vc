import { redactPii } from "./redact.ts";
const cases = [
 "i'm kabir singh", "I AM DR. ANITA VERMA", "my name is Dr.Anita Verma", "I am Miss Priya from Pune", "i am miss priya from pune", "My name is Anita Verma. What are the fees?",
 "my name is a. p. j. abdul kalam", "i am Dr. Rao. I am from Pune", "Hi, this is Dr. Rao", "my name is dr. rao. i study engineering", "mera naam hai Priya", "myself Rohan Kumar", "I am Sri Venkat Rao", "my name is Km. Mayawati",
 "I am Mr", "I am Dr.", "my name is dr.", "i am dr. a. b. c. d. e. f. g. h.", "My name is Ananya, and I want to study", "I am worried", "i am tired of this", "I am Prof. Dr. Mrs. Ms. Mr. X", "my name is shri ram prasad bismil sharma jr",
];
for (const c of cases) { const r = redactPii(c); console.log(JSON.stringify(c), "=>", JSON.stringify(r.text), JSON.stringify(r.names)); }
