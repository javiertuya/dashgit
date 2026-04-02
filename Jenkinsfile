@Library('jenkins-lib@master') _
node('slave-x1') {
	def productionBranch = "main" 
    def job = util.getJob()
    def branch = util.getBranch()
	stage("Init")  {
		deleteDir()
		checkout scm
	}
	  
	stage("Package") {
        sh "zip -r ./assembly.zip ./dashgit-web/app ./oauth-exchange"
	}
	  
	stage("Deploy") {
		def container = branch == productionBranch ? "pro-dashgit" : "dev-dashgit"
		host.deploy("./assembly.zip", "dashgit", container, branch, env.BUILD_NUMBER)
	}
}

