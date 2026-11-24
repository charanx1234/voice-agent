/**
 * FIMA V1 — Project Memory Manager
 *
 * Maintains structured, project-specific knowledge bases.
 * Each project has its own profile (architecture, decisions, progress, issues)
 * stored as structured memory records linked by project_id.
 *
 * Project records live in the `projects` table.
 * Project-linked memories live in the `memories` table with project_id set.
 */

import { ProjectInputPayload, ProjectItem, ProjectStatus } from '../../shared/types';
import { SqliteDatabase } from './sqliteDatabase';

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  objective: string | null;
  tech_stack: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  archived: number;
}

function toItem(row: ProjectRow): ProjectItem {
  let techStack: string[] = [];
  try {
    techStack = row.tech_stack ? JSON.parse(row.tech_stack) : [];
  } catch {}

  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    objective: row.objective || undefined,
    techStack,
    status: row.status as ProjectStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: Boolean(row.archived),
  };
}

function normalizeProjectName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export class ProjectMemoryManager {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  /** Creates a new project or returns the existing one with the same name. */
  public create(input: ProjectInputPayload): ProjectItem {
    const name = (input.name || '').trim();
    if (!name) throw new Error('Project name is required.');

    // Check for existing project with same name (case-insensitive)
    const existing = this.db.get<ProjectRow>(
      `SELECT * FROM projects WHERE lower(name) = ? AND archived = 0 LIMIT 1;`,
      [name.toLowerCase()]
    );
    if (existing) return toItem(existing);

    const slug = normalizeProjectName(name);
    const id = `proj_${slug}_${Date.now()}`;
    const now = new Date().toISOString();
    const techStack = input.techStack ? JSON.stringify(input.techStack) : null;

    this.db.run(
      `INSERT INTO projects (id, name, description, objective, tech_stack, status, created_at, updated_at, archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0);`,
      [
        id,
        name,
        input.description || null,
        input.objective || null,
        techStack,
        input.status || 'in_progress',
        now,
        now,
      ]
    );
    this.db.flush();
    return this.get(id)!;
  }

  public get(id: string): ProjectItem | undefined {
    const row = this.db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?;', [id]);
    return row ? toItem(row) : undefined;
  }

  public findByName(name: string): ProjectItem | undefined {
    const row = this.db.get<ProjectRow>(
      `SELECT * FROM projects WHERE lower(name) = ? LIMIT 1;`,
      [name.trim().toLowerCase()]
    );
    return row ? toItem(row) : undefined;
  }

  public list(includeArchived = false): ProjectItem[] {
    const rows = includeArchived
      ? this.db.all<ProjectRow>('SELECT * FROM projects ORDER BY updated_at DESC;')
      : this.db.all<ProjectRow>(
          'SELECT * FROM projects WHERE archived = 0 ORDER BY updated_at DESC;'
        );
    return rows.map(toItem);
  }

  public update(id: string, patch: Partial<ProjectInputPayload>): ProjectItem | undefined {
    const existing = this.db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?;', [id]);
    if (!existing) return undefined;

    const name = patch.name?.trim() || existing.name;
    const description = patch.description !== undefined ? patch.description : existing.description;
    const objective = patch.objective !== undefined ? patch.objective : existing.objective;
    const techStack = patch.techStack !== undefined
      ? JSON.stringify(patch.techStack)
      : existing.tech_stack;
    const status = patch.status || existing.status;
    const now = new Date().toISOString();

    this.db.run(
      `UPDATE projects
         SET name = ?, description = ?, objective = ?, tech_stack = ?, status = ?, updated_at = ?
       WHERE id = ?;`,
      [name, description || null, objective || null, techStack, status, now, id]
    );
    this.db.flush();
    return this.get(id);
  }

  public archive(id: string): boolean {
    const existing = this.db.get<{ id: string }>('SELECT id FROM projects WHERE id = ?;', [id]);
    if (!existing) return false;

    this.db.run(
      'UPDATE projects SET archived = 1, updated_at = ? WHERE id = ?;',
      [new Date().toISOString(), id]
    );
    this.db.flush();
    return true;
  }

  public delete(id: string): boolean {
    const existing = this.db.get<{ id: string }>('SELECT id FROM projects WHERE id = ?;', [id]);
    if (!existing) return false;

    // Unlink memories (don't delete them, just remove project association)
    this.db.run(
      `UPDATE memories SET project_id = NULL, updated_at = ? WHERE project_id = ?;`,
      [new Date().toISOString(), id]
    );
    this.db.run('DELETE FROM projects WHERE id = ?;', [id]);
    this.db.flush();
    return true;
  }

  public count(): number {
    return this.db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM projects WHERE archived = 0;'
    )?.count ?? 0;
  }

  /**
   * Attempts to identify the most relevant active project from conversation text.
   * Returns the project if one is found, null otherwise.
   */
  public detectActiveProject(conversationText: string): ProjectItem | undefined {
    if (!conversationText) return undefined;
    const projects = this.list(false);
    const lowerText = conversationText.toLowerCase();

    // Find first project whose name appears in the text
    return projects.find((p) => lowerText.includes(p.name.toLowerCase())) ?? projects[0];
  }
}
