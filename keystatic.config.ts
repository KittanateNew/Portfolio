import { config, collection, fields, singleton } from '@keystatic/core';

/**
 * Storage switch.
 * - Local dev: PUBLIC_KEYSTATIC_STORAGE=local (default) → edits write straight to src/content.
 * - Production: PUBLIC_KEYSTATIC_STORAGE=github → edits are committed to the repo,
 *   which triggers a Cloudflare rebuild. See docs/DEPLOY.md.
 * PUBLIC_ variables are used because this file also runs in the admin UI in the browser.
 */
const storageKind = import.meta.env.PUBLIC_KEYSTATIC_STORAGE === 'github' ? 'github' : 'local';
const repo = import.meta.env.PUBLIC_KEYSTATIC_GITHUB_REPO as `${string}/${string}` | undefined;

const storage =
  storageKind === 'github' && repo
    ? ({ kind: 'github', repo } as const)
    : ({ kind: 'local' } as const);

const hexColor = (label: string, defaultValue: string, description?: string) =>
  fields.text({
    label,
    description: description ?? 'Hex color, e.g. #FF5B2E',
    defaultValue,
    validation: {
      length: { min: 7, max: 7 },
      pattern: { regex: /^#[0-9a-fA-F]{6}$/, message: 'Use a 6-digit hex color like #FF5B2E' },
    },
  });

/** Images live in src/assets so Astro can generate responsive, optimised versions. */
const img = (area: string) => ({
  directory: `src/assets/images/${area}`,
  publicPath: `/src/assets/images/${area}/`,
});

export default config({
  storage,
  ui: {
    brand: { name: 'Portfolio admin' },
    navigation: {
      'About me': ['profile', 'contact', 'siteSettings'],
      Story: ['lifeTimeline', 'experience', 'education'],
      Work: ['projects', 'skills'],
    },
  },

  singletons: {
    profile: singleton({
      label: 'Profile',
      path: 'src/content/profile',
      format: { contentField: 'bio' },
      schema: {
        name: fields.text({ label: 'Name', validation: { length: { min: 1 } } }),
        headline: fields.text({
          label: 'Headline',
          description: 'Shown huge in the hero. Keep it short and punchy.',
          validation: { length: { min: 1 } },
        }),
        personality: fields.text({
          label: 'Personality line',
          description: 'A short fun fact shown in the hero.',
        }),
        bio: fields.markdoc({ label: 'Bio', extension: 'mdoc' }),
        location: fields.text({ label: 'Location' }),
        timezone: fields.text({
          label: 'Time zone',
          description: 'IANA name used for the live clock in the footer, e.g. Asia/Bangkok',
          defaultValue: 'Asia/Bangkok',
        }),
        photos: fields.array(
          fields.object({
            image: fields.image({ label: 'Photo', ...img('profile'), validation: { isRequired: true } }),
            alt: fields.text({ label: 'Alt text (describe the photo)' }),
          }),
          { label: 'Photos', itemLabel: (p) => p.fields.alt.value || 'Photo' }
        ),
        socials: fields.array(
          fields.object({
            label: fields.text({ label: 'Label', description: 'e.g. GitHub, LinkedIn' }),
            url: fields.url({ label: 'URL', validation: { isRequired: true } }),
          }),
          { label: 'Social links', itemLabel: (s) => s.fields.label.value || 'Link' }
        ),
        cv: fields.file({ label: 'CV (PDF)', directory: 'public/cv', publicPath: '/cv/' }),
      },
    }),

    contact: singleton({
      label: 'Contact',
      path: 'src/content/contact',
      format: { data: 'yaml' },
      schema: {
        email: fields.text({ label: 'Email', validation: { length: { min: 3 } } }),
        phone: fields.text({ label: 'Phone (optional)' }),
        formEnabled: fields.checkbox({ label: 'Show contact form', defaultValue: true }),
        availability: fields.text({ label: 'Availability note', description: 'e.g. Open to new roles from June' }),
        ctaHeadline: fields.text({
          label: 'Call-to-action headline',
          description: 'The big line after the marquee.',
        }),
        marqueeWords: fields.array(fields.text({ label: 'Word' }), {
          label: 'Marquee words',
          description: 'Short words that scroll endlessly above the call to action.',
          itemLabel: (w) => w.value || 'Word',
        }),
      },
    }),

    siteSettings: singleton({
      label: 'Site settings',
      path: 'src/content/site-settings',
      format: { data: 'yaml' },
      schema: {
        seoTitle: fields.text({ label: 'SEO title', validation: { length: { min: 1, max: 70 } } }),
        seoDescription: fields.text({
          label: 'SEO description',
          multiline: true,
          validation: { length: { min: 1, max: 170 } },
        }),
        ogImage: fields.image({
          label: 'Open Graph image (1200×630)',
          directory: 'public/images/og',
          publicPath: '/images/og/',
        }),
        accentColor: hexColor('Accent color', '#FF5B2E'),
        sceneEnabled: fields.checkbox({ label: 'Enable the 3D timeline scene', defaultValue: true }),
      },
    }),
  },

  collections: {
    lifeTimeline: collection({
      label: 'Life timeline',
      slugField: 'title',
      path: 'src/content/timeline/*',
      format: { data: 'yaml' },
      columns: ['title', 'start'],
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        type: fields.select({
          label: 'Type',
          options: [
            { label: 'Birth', value: 'birth' },
            { label: 'Education', value: 'education' },
            { label: 'Job', value: 'job' },
            { label: 'Move', value: 'move' },
            { label: 'Achievement', value: 'achievement' },
            { label: 'Personal', value: 'personal' },
          ],
          defaultValue: 'personal',
        }),
        start: fields.date({ label: 'Start date', validation: { isRequired: true } }),
        end: fields.date({ label: 'End date (optional)' }),
        location: fields.text({ label: 'Location' }),
        description: fields.text({ label: 'Description', multiline: true }),
        image: fields.image({ label: 'Image (optional)', ...img('timeline') }),
        markerColor: hexColor('3D marker color', '#FF5B2E'),
      },
    }),

    experience: collection({
      label: 'Experience',
      slugField: 'company',
      path: 'src/content/experience/*',
      format: { data: 'yaml' },
      columns: ['company', 'role'],
      schema: {
        company: fields.slug({ name: { label: 'Company' } }),
        role: fields.text({ label: 'Role', validation: { length: { min: 1 } } }),
        start: fields.date({ label: 'Start', validation: { isRequired: true } }),
        end: fields.date({ label: 'End', description: 'Leave empty for "Present"' }),
        location: fields.text({ label: 'Location' }),
        description: fields.text({ label: 'Description', multiline: true }),
        skills: fields.array(fields.text({ label: 'Skill' }), {
          label: 'Skills',
          itemLabel: (s) => s.value || 'Skill',
        }),
        logo: fields.image({ label: 'Logo', ...img('logos') }),
      },
    }),

    education: collection({
      label: 'Education',
      slugField: 'school',
      path: 'src/content/education/*',
      format: { data: 'yaml' },
      columns: ['school', 'degree'],
      schema: {
        school: fields.slug({ name: { label: 'School' } }),
        degree: fields.text({ label: 'Degree' }),
        field: fields.text({ label: 'Field of study' }),
        start: fields.date({ label: 'Start', validation: { isRequired: true } }),
        end: fields.date({ label: 'End' }),
        description: fields.text({ label: 'Description', multiline: true }),
      },
    }),

    projects: collection({
      label: 'Projects',
      slugField: 'title',
      path: 'src/content/projects/*',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['title', 'date'],
      schema: {
        title: fields.slug({
          name: { label: 'Title' },
          slug: { label: 'Slug', description: 'Used in the URL: /projects/<slug>' },
        }),
        summary: fields.text({ label: 'Summary', multiline: true, validation: { length: { min: 1, max: 220 } } }),
        body: fields.markdoc({ label: 'Body', extension: 'mdoc' }),
        cover: fields.image({ label: 'Cover image', ...img('projects'), validation: { isRequired: true } }),
        gallery: fields.array(
          fields.object({
            image: fields.image({ label: 'Image', ...img('projects'), validation: { isRequired: true } }),
            alt: fields.text({ label: 'Alt text' }),
          }),
          { label: 'Gallery', itemLabel: (g) => g.fields.alt.value || 'Image' }
        ),
        tech: fields.array(fields.text({ label: 'Tag' }), { label: 'Tech tags', itemLabel: (t) => t.value || 'Tag' }),
        liveUrl: fields.url({ label: 'Live URL' }),
        repoUrl: fields.url({ label: 'Repository URL' }),
        featured: fields.checkbox({ label: 'Featured', defaultValue: false }),
        date: fields.date({ label: 'Date', validation: { isRequired: true } }),
      },
    }),

    skills: collection({
      label: 'Skills',
      slugField: 'name',
      path: 'src/content/skills/*',
      format: { data: 'yaml' },
      columns: ['name', 'category'],
      schema: {
        name: fields.slug({ name: { label: 'Name' } }),
        category: fields.select({
          label: 'Category',
          options: [
            { label: 'Engineering', value: 'engineering' },
            { label: 'Design', value: 'design' },
            { label: 'Tools', value: 'tools' },
            { label: 'Soft skills', value: 'soft' },
            { label: 'Languages', value: 'languages' },
          ],
          defaultValue: 'engineering',
        }),
        level: fields.integer({ label: 'Level (1–5)', defaultValue: 3, validation: { min: 1, max: 5 } }),
      },
    }),
  },
});
