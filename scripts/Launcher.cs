using System;
using System.Diagnostics;
using System.IO;

class Program {
    [STAThread]
    static void Main(string[] args) {
        string appDir = @"C:\25r11a6760\FRIDAY";
        string electronExe = Path.Combine(appDir, @"node_modules\electron\dist\electron.exe");
        string mainScript = Path.Combine(appDir, @"dist-electron\main\index.js");

        if (!File.Exists(electronExe) || !File.Exists(mainScript)) {
            return;
        }

        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = electronExe;
        psi.Arguments = "\"" + mainScript + "\"";
        psi.WorkingDirectory = appDir;
        psi.UseShellExecute = true; // Completely independent process breakaway
        psi.WindowStyle = ProcessWindowStyle.Normal;

        try {
            Process.Start(psi);
        } catch {}
    }
}
