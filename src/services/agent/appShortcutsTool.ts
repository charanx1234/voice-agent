import { execFile, spawn } from 'child_process';
import { AllowedApp } from '../../shared/types';

export const ALLOWED_APPLICATIONS: AllowedApp[] = [
  {
    id: 'notepad',
    name: 'Notepad',
    description: 'Windows text editor',
    command: 'notepad.exe',
  },
  {
    id: 'calculator',
    name: 'Calculator',
    description: 'Windows Calculator app',
    command: 'calc.exe',
  },
  {
    id: 'paint',
    name: 'Paint',
    description: 'Windows Paint graphic drawing app',
    command: 'mspaint.exe',
  },
  {
    id: 'explorer',
    name: 'File Explorer',
    description: 'Windows File Explorer',
    command: 'explorer.exe',
  },
  {
    id: 'cmd',
    name: 'Command Prompt',
    description: 'Windows Command Prompt terminal',
    command: 'cmd.exe',
  },
];

export const appShortcutsToolDefinition = {
  name: 'launch_allowed_app',
  description:
    'Launches a safe, pre-approved desktop application from the allowlist (Notepad, Calculator, Paint, File Explorer, Command Prompt). Requires user confirmation.',
  parameters: {
    type: 'OBJECT',
    properties: {
      appId: {
        type: 'STRING',
        description: 'The identifier of the app to launch: "notepad", "calculator", "paint", "explorer", or "cmd".',
      },
    },
    required: ['appId'],
  },
};

export async function executeAppShortcutsTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  const targetId = (args.appId || '').toLowerCase().trim();
  const app = ALLOWED_APPLICATIONS.find(
    (a) => a.id === targetId || a.name.toLowerCase() === targetId
  );

  if (!app) {
    return {
      success: false,
      error: `Application "${targetId}" is not in the approved allowlist. Allowed applications are: ${ALLOWED_APPLICATIONS.map(
        (a) => a.name
      ).join(', ')}.`,
    };
  }

  return new Promise((resolve) => {
    try {
      // Use spawn/execFile directly on the allowed binary without invoking a shell interpreter
      const child = spawn(app.command, [], {
        detached: true,
        stdio: 'ignore',
        shell: false, // Strict: no shell evaluation
      });

      child.unref();

      resolve({
        success: true,
        message: `Successfully launched ${app.name}.`,
        app: app.name,
      });
    } catch (err: any) {
      resolve({
        success: false,
        error: `Could not launch ${app.name}: ${err.message}`,
      });
    }
  });
}

