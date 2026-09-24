import dotenv from 'dotenv';
dotenv.config();

console.log('--- ENV CHECK ---');
console.log('GEMINI_API_KEY present:', Boolean(process.env.GEMINI_API_KEY));
if (process.env.GEMINI_API_KEY) {
  console.log('GEMINI_API_KEY prefix:', process.env.GEMINI_API_KEY.slice(0, 8) + '...');
}
console.log('CREDENTIAL_ENCRYPTION_KEY present:', Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY));
console.log('GOOGLE_APPLICATION_CREDENTIALS present:', Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS));
console.log('-----------------');
