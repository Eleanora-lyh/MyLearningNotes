# Translation Workflow Guide

This document describes the workflow for translating content between Chinese and English on this Hugo multilingual site.

## Directory Structure

```
content/
├── posts/              # Chinese content (default language)
│   ├── first-post.md
│   └── Linux/
│       ├── linux-basics.md
│       └── ...
└── en/                 # English content
    ├── posts/
    │   ├── first-post.md
    │   └── Linux/
    │       └── linux-basics.md
    ├── about.md
    └── archives.md
```

## Translation Process

### Step 1: Identify Content to Translate

1. Navigate to the Chinese content directory: `content/posts/`
2. Select the article you want to translate
3. Note the file path relative to `content/posts/`

### Step 2: Prepare English Version

1. Create the same directory structure under `content/en/posts/`
2. Create a new file with the same name in the corresponding English directory

Example:
- Chinese: `content/posts/Linux/linux-basics.md`
- English: `content/en/posts/Linux/linux-basics.md`

### Step 3: Use AI Translation Prompt

Use the prompt template below with your preferred AI assistant (Claude, ChatGPT, etc.):

```
Please translate the following Hugo blog post from Chinese to English. 

Requirements:
1. Preserve all frontmatter (YAML between ---) exactly as is, except translate the "title" field
2. Translate the content naturally, maintaining technical accuracy
3. Keep all markdown formatting, code blocks, and links intact
4. Preserve technical terms appropriately (some may stay in English)
5. Maintain the same tone and style as the original

Here's the content to translate:

[PASTE YOUR CHINESE CONTENT HERE]
```

### Step 4: Create the Translated File

1. Copy the translated content
2. Save it to the appropriate path under `content/en/posts/`
3. Verify the frontmatter is correct

### Step 5: Link the Translations

In the frontmatter of both files, ensure they have matching identifiers:

**Chinese version** (`content/posts/Linux/linux-basics.md`):
```yaml
---
title: "Linux 基础知识"
date: 2024-01-15
translationKey: "linux-basics"
---
```

**English version** (`content/en/posts/Linux/linux-basics.md`):
```yaml
---
title: "Linux Basics"
date: 2024-01-15
translationKey: "linux-basics"
---
```

The `translationKey` must be identical in both versions.

### Step 6: Test the Translation

1. Run the Hugo development server: `hugo server -D`
2. Navigate to the Chinese article
3. Look for the language switcher in the navigation menu
4. Click to switch to English and verify the translation appears correctly
5. Check that all links, images, and formatting work properly

## Translation Best Practices

### Technical Terms

- Keep widely-used English terms in English (e.g., "Git", "Docker", "API")
- Translate concepts and explanations naturally
- Use standard technical translations when they exist

### Code Blocks

- Never translate code content
- Translate code comments if they provide important context
- Keep command-line examples in original form

### Links and References

- Update internal links to point to English versions when available
- Keep external links as-is (they're usually in English anyway)
- Add language indicators for external resources when helpful

### Frontmatter Guidelines

**Always keep these fields unchanged:**
- `date`
- `draft`
- `tags`
- `categories`
- `slug`
- `translationKey`

**Translate these fields:**
- `title`
- `description`
- `summary`

## Batch Translation

For translating multiple articles:

1. Create a list of articles to translate
2. Prioritize by importance/popularity
3. Translate in batches of 3-5 articles
4. Test each batch before moving to the next
5. Update the progress in a tracking document

## Quality Checklist

Before publishing a translation:

- [ ] All frontmatter fields are correct
- [ ] `translationKey` matches between versions
- [ ] Title and descriptions are translated
- [ ] Technical terms are handled appropriately
- [ ] Code blocks are untouched
- [ ] Links work correctly
- [ ] Images display properly
- [ ] Formatting is preserved
- [ ] Language switcher shows both versions
- [ ] Content reads naturally in English

## Maintenance

When updating content:

1. Update the Chinese version first
2. Mark the English version with a note if outdated
3. Schedule translation update
4. Keep `date` field synchronized for version tracking

## AI Translation Prompt Template

Save this template for consistent translations:

---

**For General Articles:**

```
Translate this Hugo blog article from Chinese to English.

RULES:
1. Keep all YAML frontmatter structure intact
2. Only translate the "title" and "description" fields in frontmatter
3. Translate content naturally while maintaining technical accuracy
4. Preserve all markdown syntax, code blocks, and formatting
5. Keep technical terms in English when appropriate
6. Maintain a professional, informative tone

CONTENT:

[PASTE CONTENT HERE]
```

**For Technical Tutorials:**

```
Translate this technical tutorial from Chinese to English.

FOCUS ON:
1. Technical accuracy - verify all command examples and code
2. Clear instructions - ensure steps are easy to follow
3. Consistent terminology - use standard technical English terms
4. Preserve all code blocks exactly as written
5. Translate UI/interface terms consistently

PRESERVE:
- All YAML frontmatter except "title" and "description"
- Command-line examples
- Code snippets
- File paths and system messages
- Technical product names

CONTENT:

[PASTE CONTENT HERE]
```

**For Conceptual Posts:**

```
Translate this conceptual article from Chinese to English.

MAINTAIN:
1. The author's voice and style
2. Logical flow and argument structure
3. Examples and analogies (adapt culturally if needed)
4. Technical precision where applicable

FOCUS ON:
- Natural English expression
- Clear explanations of complex concepts
- Smooth transitions between ideas
- Appropriate academic/professional tone

CONTENT:

[PASTE CONTENT HERE]
```

## Troubleshooting

### Language Switcher Not Appearing

1. Verify `translationKey` is identical in both versions
2. Check that both files are in the correct directories
3. Ensure `defaultContentLanguage` is set in `hugo.toml`
4. Clear Hugo cache: `rm -rf .hugo_build.lock`

### Wrong Language Detected

1. Check `languageCode` in frontmatter (if specified)
2. Verify file is in correct language directory (`content/en/` for English)
3. Review `hugo.toml` language configuration

### Missing Content

1. Ensure file names match between language versions
2. Check directory structure mirrors the Chinese version
3. Verify no `draft: true` in frontmatter (unless intended)

## Resources

- [Hugo Multilingual Documentation](https://gohugo.io/content-management/multilingual/)
- [PaperMod Theme Language Support](https://github.com/adityatelange/hugo-PaperMod/wiki/FAQs#bundled-translations)
- Site Configuration: `hugo.toml`

---

Last Updated: 2024-01-15