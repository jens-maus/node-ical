library (
    identifier: 'nodeModuleBuilder@PROD',
    retriever: modernSCM(
        [
            $class: 'GitSCMSource',
            credentialsId: "git_read_only",
            remote: "https://git.ellucian.com/scm/devops/jenkins-pipeline-node-module.git"
        ]
    )
)

node('ec2-worker-u18-medium') {
  stage('bootstrap') {
      cleanWs()
  }
  stage('build') {
    nodeModuleBuilder([
        nodeLabel: 'NODE_VERSION_16X_LATEST',
        publishBranches:['master','snapshots'],
        runUnitTests: false,
        reportJUnitFiles:['test_reports/junit.xml']
    ])
  }
}