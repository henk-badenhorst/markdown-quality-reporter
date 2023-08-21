#! /usr/bin/env node
import { Command } from 'commander';
import fg from 'fast-glob';
import { join } from 'path';
import { existsSync, readFileSync, lstatSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import chalk from 'chalk'
interface UrlDetails {
    url: string,
    statusCode: number,
    succeeded: boolean
};

interface Report {
    [path: string]: UrlDetails[]
};

const program = new Command();
const workspaceRootPath = process.cwd();
program
    .command('run')
    .description('Report on the quality of markdown files')
    .version('1.0.0')
    .action((str, options) => {
        const report: Report = {}
        const markdownPaths = fg.sync(join(workspaceRootPath, '**', '*.md'), {
            cwd: workspaceRootPath,
            ignore: [...pathsToExclude(workspaceRootPath)],
        });


        process.stdout.write(chalk.bold.green('\nMarkdown Link Reporter\n\n'));

        for (const [index, markdownPath] of markdownPaths.entries()) {

            process.stdout.write(`${chalk.bold.green(`[${index + 1}/${markdownPaths.length}]`)} ${chalk.gray(`Checking ${markdownPath}`)}\n`);

            const fileContent = getMarkdownFileContent(markdownPath);
            const allUrls = getAllUrls(fileContent);
            report[markdownPath] = []
            for (const url of allUrls) {
                if (url) {
                    try {
                        const statusCode = parseInt(execSync(
                            `curl --silent -I -o /dev/null -w "%{http_code}" ${url}`
                        ).toString());
                        report[markdownPath].push({
                            url,
                            statusCode,
                            succeeded: statusCode >= 400 ? false : true
                        })
                    } catch (e) {
                        console.error(e)
                    }
                }


            }
        }
        writeReport(workspaceRootPath, 'tmp', report)
    });

program.parse();

function pathsToExclude(workspaceRootPath: string): string[] {
    const gitDirPath = join(workspaceRootPath, '.git', 'config');
    if (existsSync(gitDirPath)) {
        const gitIgnoreFileContents = execSync('git check-ignore *', {
            cwd: workspaceRootPath,
        }).toString();
        const pathsToExclude = gitIgnoreFileContents
            .split('\n')
            .map((lineContent) => lineContent.trim())
            // filter out line comments
            .filter(
                (lineContent) =>
                    (lstatSync(join(workspaceRootPath, lineContent)).isDirectory() ||
                        lineContent.endsWith('.md')) &&
                    lineContent !== ''
            )
            .map((lineContent) =>
                lineContent.endsWith('.md')
                    ? join(workspaceRootPath, lineContent)
                    : join(workspaceRootPath, lineContent, '**', '*.md')
            );
        return pathsToExclude;
    }
    return [];
}


function getMarkdownFileContent(path: string) {
    return readFileSync(path, { encoding: 'utf-8' }).toString();
}

function writeReport(workspaceRootPath: string, outputDirectory: string, report: Report) {
    const outputRootDirectoryPath = join(workspaceRootPath, outputDirectory)
    const outputReportPath = join(workspaceRootPath, outputDirectory, 'markdown-link-report.json')

    if (existsSync(outputRootDirectoryPath)) {
        if (existsSync(outputReportPath)) {
            rmSync(join(outputReportPath))
        }
    } else {
        mkdirSync(join(workspaceRootPath, outputDirectory))
    }


    writeFileSync(outputReportPath, JSON.stringify(report, null, 4), { encoding: 'utf-8' });
    process.stdout.write(chalk.bold.green(`\n Successfully generated the report: \n\n${chalk.reset.blue(outputReportPath)}\n`));
    
}


function getAllUrls(markdownFileContent: string): RegExpMatchArray | null[] {
    const regexp =
        /(http|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-])/g;
    return markdownFileContent.match(regexp) || [];
}

