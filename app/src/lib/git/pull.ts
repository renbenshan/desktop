import {
  git,
  GitError,
  IGitExecutionOptions,
  gitNetworkArguments,
} from './core'
import { Repository } from '../../models/repository'
import { PullProgressParser, executionOptionsWithProgress } from '../progress'
import { IPullProgress } from '../app-state'
import {
  IGitAccount,
  envForAuthentication,
  AuthenticationErrors,
} from './authentication'
import { enableRecurseSubmodulesFlag } from '../feature-flag'

function getPullArgs(
  remote: string,
  progressCallback?: (progress: IPullProgress) => void
) {
  if (enableRecurseSubmodulesFlag()) {
    return progressCallback != null
      ? [
          ...gitNetworkArguments,
          'pull',
          '--no-rebase',
          '--recurse-submodules',
          '--progress',
          remote,
        ]
      : [
          ...gitNetworkArguments,
          'pull',
          '--no-rebase',
          '--recurse-submodules',
          remote,
        ]
  } else {
    return progressCallback != null
      ? [...gitNetworkArguments, 'pull', '--no-rebase', '--progress', remote]
      : [...gitNetworkArguments, 'pull', '--no-rebase', remote]
  }
}

/**
 * Pull from the specified remote.
 *
 * @param repository - The repository in which the pull should take place
 *
 * @param remote     - The name of the remote that should be pulled from
 *
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the pull operation. When provided this enables
 *                           the '--progress' command line flag for
 *                           'git pull'.
 */
export async function pull(
  repository: Repository,
  account: IGitAccount | null,
  remote: string,
  progressCallback?: (progress: IPullProgress) => void
): Promise<void> {
  let opts: IGitExecutionOptions = {
    env: envForAuthentication(account),
    expectedErrors: AuthenticationErrors,
  }

  if (progressCallback) {
    const title = `Pulling ${remote}`
    const kind = 'pull'

    opts = await executionOptionsWithProgress(
      { ...opts, trackLFSProgress: true },
      new PullProgressParser(),
      progress => {
        // In addition to progress output from the remote end and from
        // git itself, the stderr output from pull contains information
        // about ref updates. We don't need to bring those into the progress
        // stream so we'll just punt on anything we don't know about for now.
        if (progress.kind === 'context') {
          if (!progress.text.startsWith('remote: Counting objects')) {
            return
          }
        }

        const description =
          progress.kind === 'progress' ? progress.details.text : progress.text

        const value = progress.percent

        progressCallback({ kind, title, description, value, remote })
      }
    )

    // Initial progress
    progressCallback({ kind, title, value: 0, remote })
  }

  const args = getPullArgs(remote, progressCallback)
  const result = await git(args, repository.path, 'pull', opts)

  if (result.gitErrorDescription) {
    throw new GitError(result, args)
  }
}
