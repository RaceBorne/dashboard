/**
 * One-shot: list every Shopify blog with its handle + article count.
 *
 * Run:  npx tsx scripts/list-shopify-blogs.ts
 *
 * Output tells us whether CS+ | Bike Builds and Blogs live as two
 * separate blogs (each with its own handle) or as one blog split by
 * article tag. That answer shapes the Journals UI + publish pipeline.
 */

import 'dotenv/config';

async function main() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!domain || !token) {
    console.error('Missing SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN');
    process.exit(1);
  }
  const query = /* GraphQL */ `
    {
      blogs(first: 50) {
        edges {
          node {
            id
            handle
            title
            articles(first: 5) {
              edges { node { id handle title tags isPublished updatedAt } }
            }
          }
        }
      }
    }
  `;
  const res = await fetch(`https://${domain}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const json = (await res.json()) as {
    data?: {
      blogs: {
        edges: Array<{
          node: {
            id: string;
            handle: string;
            title: string;
            articles: {
              edges: Array<{
                node: {
                  id: string;
                  handle: string;
                  title: string;
                  tags: string[];
                  isPublished: boolean;
                  updatedAt: string;
                };
              }>;
            };
          };
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    console.error('GraphQL errors:', json.errors);
    process.exit(1);
  }
  const blogs = json.data?.blogs.edges ?? [];
  console.log(`\nFound ${blogs.length} blog(s) in ${domain}:\n`);
  for (const { node } of blogs) {
    console.log(`• ${node.title}`);
    console.log(`  id:     ${node.id}`);
    console.log(`  handle: ${node.handle}`);
    const recent = node.articles.edges;
    if (recent.length === 0) {
      console.log(`  (no articles yet)`);
    } else {
      console.log(`  recent articles:`);
      for (const { node: a } of recent) {
        const tagStr = a.tags.length ? ` [${a.tags.join(', ')}]` : '';
        const status = a.isPublished ? 'published' : 'draft';
        console.log(`    - ${a.title} (${status})${tagStr}`);
      }
    }
    console.log();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
