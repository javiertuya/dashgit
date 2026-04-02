@Library('jenkins-lib@master') _
node('slave-x1') {
	def productionBranch = "main" 
    def commitHash // establecido tras el checkout
    def job = util.getJob()
    def branch = util.getBranch()
	try {
	  stage("Init")  {
		deleteDir()
		checkout scm
		commitHash = checkout(scm).GIT_COMMIT
		util.setVersion("pom.xml", branch, env.BUILD_NUMBER)
		gitlab.start(job, branch, commitHash)
	  }
	  
	  stage("package") {
        sh "zip -r ./assembly.zip . -x dashgit-web/app/*"
	  }
	  
	  stage("Deploy") {
		def container = branch == productionBranch ? "pro-dashgit" : "dev-dashgit"
		host.deploy("./assembly.zip", "dashgit", container, branch, env.BUILD_NUMBER)
	  }

	} catch (Exception e) {
	  gitlab.failure(job, branch, commitHash, e)
	  throw e
	}
	gitlab.finish(job, branch, commitHash, currentBuild.currentResult)
}

