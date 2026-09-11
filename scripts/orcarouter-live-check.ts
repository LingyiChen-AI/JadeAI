/**
 * Live smoke test through the *implemented* provider code path.
 * Not a curl substitute: it calls getModel()/getParseModel() from
 * src/lib/ai/provider.ts and discoverOrcaModels() from src/lib/ai/orcarouter.ts
 * against the real OrcaRouter relay.
 *
 * Never prints the key. Run: npx tsx scripts/orcarouter-live-check.ts
 */
import { readFileSync } from 'node:fs';
import { generateText } from 'ai';
import {
  getModel,
  getParseModel,
  getOrcaRouterApiBase,
  AIConfigError,
} from '../src/lib/ai/provider';
import {
  discoverOrcaModels,
  ORCAROUTER_PUBLIC_API_BASE,
  type OrcaCatalogModel,
} from '../src/lib/ai/orcarouter';

const apiKey = process.env.ORCAROUTER_API_KEY ?? '';

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function show(models: OrcaCatalogModel[], limit = 8) {
  return models.slice(0, limit).map((m) => m.id).join(', ');
}

async function main() {
  if (!apiKey) fail('ORCAROUTER_API_KEY is not set');

  console.log('=== origins ===');
  const base = getOrcaRouterApiBase({ baseURL: '' });
  console.log('inference base :', base);
  if (base !== ORCAROUTER_PUBLIC_API_BASE) fail(`unexpected inference base ${base}`);

  // --- 1. Text catalog through the implemented discovery path --------------
  console.log('\n=== text catalog (?capability=chat) ===');
  const text = await discoverOrcaModels({ apiBase: base, apiKey, capability: 'text' });
  console.log('source:', text.source, '| count:', text.models.length);
  if (text.source !== 'live') fail(`text discovery did not go live (${text.reason})`);
  if (text.models.length === 0) fail('empty text catalog');
  console.log('sample:', show(text.models));
  const nonText = text.models.filter((m) =>
    m.endpointTypes.some((t) => ['image-generation', 'openai-video', 'jina-rerank', 'embeddings'].includes(t))
  );
  if (nonText.length) fail(`text catalog leaked non-text models: ${show(nonText)}`);
  console.log('no non-text specialists leaked into the text list: ok');

  // --- 2. Multimodal catalog: must declare image input --------------------
  console.log('\n=== multimodal catalog (chat + declared image input) ===');
  const mm = await discoverOrcaModels({
    apiBase: base,
    apiKey,
    capability: 'multimodal',
    requiredInputModalities: ['image'],
  });
  console.log('source:', mm.source, '| count:', mm.models.length);
  if (mm.source !== 'live') fail(`multimodal discovery did not go live (${mm.reason})`);
  if (mm.models.length === 0) fail('empty multimodal catalog');
  const undeclared = mm.models.filter((m) => !m.inputModalities.includes('image'));
  if (undeclared.length) fail(`multimodal catalog leaked models without image input: ${show(undeclared)}`);
  console.log('sample:', show(mm.models));
  console.log('every multimodal entry declares image input: ok');
  console.log('text-only models (must be absent):',
    text.models.filter((m) => !m.inputModalities.includes('image')).slice(0, 5).map((m) => m.id).join(', '));

  // --- 3. Real inference through getModel() ------------------------------
  const modelId = process.env.ORCA_TEST_MODEL || text.models.find((m) => m.id === 'openai/gpt-5.5')?.id || text.models[0].id;
  console.log(`\n=== real inference via getModel() (model: ${modelId}) ===`);
  const model = getModel(
    { provider: 'orcarouter', apiKey, baseURL: base, model: modelId },
    modelId
  );
  const started = Date.now();
  const res = await generateText({
    model,
    prompt: 'Reply with exactly the word: pong',
    maxOutputTokens: 256,
  });
  console.log('latency ms:', Date.now() - started);
  console.log('finishReason:', res.finishReason);
  console.log('text:', JSON.stringify(res.text.trim()));
  if (!res.text.trim()) fail('empty completion text');
  console.log('usage:', JSON.stringify(res.usage));

  // --- 4. The PKCE provider id must take the identical path --------------
  console.log('\n=== same call via the PKCE provider id ===');
  const modelOauth = getModel(
    { provider: 'orcarouter-oauth', apiKey, baseURL: base, model: modelId },
    modelId
  );
  const res2 = await generateText({
    model: modelOauth,
    prompt: 'Reply with exactly the word: pong',
    maxOutputTokens: 256,
  });
  console.log('text:', JSON.stringify(res2.text.trim()));
  if (!res2.text.trim()) fail('empty completion text on the PKCE provider id');
  console.log('both provider ids route inference to the same relay: ok');

  // --- 5. Multimodal guard: a text-only model is refused -----------------
  console.log('\n=== multimodal guard ===');
  try {
    getParseModel({
      provider: 'orcarouter',
      apiKey,
      baseURL: base,
      model: modelId,
      parseModel: '',
    });
    fail('getParseModel accepted a missing multimodal model');
  } catch (e) {
    if (!(e instanceof AIConfigError)) throw e;
    console.log('refused without a multimodal model: ok');
  }
  const mmId = process.env.ORCA_TEST_MM_MODEL || mm.models.find((m) => m.id === 'openai/gpt-5.5')?.id || mm.models[0].id;
  const parseModel = getParseModel({
    provider: 'orcarouter',
    apiKey,
    baseURL: base,
    model: modelId,
    parseModel: mmId,
  });
  const img = await generateText({
    model: parseModel,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the single shape in this image in one short sentence.' },
          {
            type: 'image',
            image: readFileSync(
              new URL('./orcarouter-test-image.png', import.meta.url)
            ),
            mediaType: 'image/png',
          },
        ],
      },
    ],
  });
  console.log('multimodal call model:', mmId);
  console.log('multimodal text:', JSON.stringify(img.text.trim().slice(0, 120)));
  console.log('declared-image model accepted an image request: ok');

  console.log('\nALL LIVE CHECKS PASSED');
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
